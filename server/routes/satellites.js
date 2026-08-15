const express = require("express");
const router = express.Router();
const db = require("../db");
const custodian = require("../custodian");
const { getNow } = require("../testClock");
const requireAuth = require("../middleware/requireAuth");
const { createPortfolio } = require("../portfolioValue");
const { TIERS, CATEGORIES, FREEROLL_PRIZE_CONFIG } = require("../satelliteScheduler");
const { currentStonkUsdPriceMicros } = require("../contestScheduler");
const { isWeekday, etCalendarDate, etDateTime, easternParts, currentWeekWindow } = require("../timeHelpers");

function stonkToUsd(stonkAmount) {
  return Number(((stonkAmount * currentStonkUsdPriceMicros()) / 1e6).toFixed(2));
}

function hourToParts(hourFloat) {
  const hour = Math.floor(hourFloat);
  const minute = Math.round((hourFloat - hour) * 60);
  return { hour, minute };
}

function nextOccurrence(tier, now) {
  if (tier.cadence === "weekly") {
    const { weekStart } = currentWeekWindow(now);
    return weekStart;
  }
  if (tier.cadence === "hourly") {
    // Degen Hours: 6 slots a day, offset 30 min from the top of the hour
    // (9:30, 10:30 ... 2:30), weekdays only. Probe forward hour-by-hour
    // rather than day-by-day, since "later today" is the common case.
    let probe = new Date(now);
    for (let i = 0; i < 24 * 8; i++) {
      if (isWeekday(probe)) {
        const p = easternParts(probe);
        const h = Number(p.hour);
        if (h >= 9 && h <= 14) {
          const { year, month, day } = etCalendarDate(probe);
          const opensAt = etDateTime(year, month, day, h, 30, 0);
          const locksAt = new Date(opensAt.getTime() + 60 * 60000);
          if (now.getTime() < locksAt.getTime()) return opensAt;
        }
      }
      probe = new Date(probe.getTime() + 60 * 60000);
    }
    return now;
  }
  let probe = new Date(now);
  for (let i = 0; i < 8; i++) {
    if (isWeekday(probe)) {
      const { year, month, day } = etCalendarDate(probe);
      const o = hourToParts(tier.openHour);
      const l = hourToParts(tier.lockHour);
      const opensAt = etDateTime(year, month, day, o.hour, o.minute, 0);
      const locksAt = etDateTime(year, month, day, l.hour, l.minute, 0);
      if (now.getTime() < locksAt.getTime()) return opensAt;
    }
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000);
  }
  return now;
}

function serializePendingTier(tier, now, myAccountId) {
  const myPendingCount = myAccountId
    ? db
        .prepare(
          `SELECT COUNT(*) as n FROM pending_allocations
           WHERE account_id = ? AND target_type = 'satellite' AND target_tier_id = ?
           AND IFNULL(target_price_level, '') = IFNULL(?, '') AND status = 'pending'`
        )
        .get(myAccountId, tier.categoryId, tier.priceLevel).n
    : 0;

  // For the free level specifically, "tickets projected" doesn't come from
  // this room's own pool (which is always $0 by definition) — it comes
  // from that CATEGORY's own separate freeroll fund. Reading the real
  // number here instead of leaving it hardcoded at 0.
  const freerollFund = tier.priceLevel === "free" ? db.prepare("SELECT * FROM freeroll_fund WHERE category_id = ?").get(tier.categoryId) : null;
  const freerollPrizesAvailable = freerollFund?.prizes_available ?? 0;
  const freerollLifetimeAwarded = freerollFund?.total_prizes_funded_lifetime ?? 0;

  return {
    id: null,
    tierId: tier.categoryId,
    priceLevel: tier.priceLevel,
    priceLevelName: tier.priceLevelName,
    icon: tier.icon,
    name: tier.name,
    cadence: tier.cadence,
    entryFee: tier.entryFee,
    entryFeeUsd: stonkToUsd(tier.entryFee),
    ticketCost: 3000,
    status: "pending",
    opensAt: nextOccurrence(tier, now).toISOString(),
    locksAt: null,
    entrantCount: 0,
    poolGross: 0,
    ticketsProjected: freerollPrizesAvailable,
    lifetimeAwarded: freerollLifetimeAwarded,
    remainderProjected: 0,
    joined: myPendingCount > 0,
    myEntryCount: myPendingCount,
    maxEntriesPerAccount: tier.maxEntriesPerAccount,
  };
}

function serializeSatellite(s, myAccountId) {
  const entrantCount = db
    .prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ?")
    .get(s.id).n;
  const grossPool = s.status === "open" ? entrantCount * s.entry_fee : s.pool_gross;
  const playerPool = grossPool * 0.85;
  const ticketsProjected = Math.floor(playerPool / s.ticket_cost);
  const remainderProjected = s.status === "open" ? playerPool - ticketsProjected * s.ticket_cost : s.remainder_stonk;

  // Freeroll rooms never fund a prize from their own $0 pool — the real
  // number lives in that category's own separate freeroll fund instead.
  // Reading it directly here rather than showing the always-zero
  // pool-based projection, which was never accurate for these rooms.
  const freerollFund = s.price_level === "free" ? db.prepare("SELECT * FROM freeroll_fund WHERE category_id = ?").get(s.tier_id) : null;
  const freerollPrizesAvailable = s.status === "open" && freerollFund ? freerollFund.prizes_available : null;
  const freerollLifetimeAwarded = freerollFund?.total_prizes_funded_lifetime ?? 0;

  const tierMeta = TIERS.find((t) => t.categoryId === s.tier_id && t.priceLevel === s.price_level);

  const myEntryCount = myAccountId
    ? db.prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ? AND account_id = ?").get(s.id, myAccountId).n
    : 0;
  const myFirstEntry = myAccountId
    ? db.prepare("SELECT * FROM satellite_entries WHERE satellite_id = ? AND account_id = ? ORDER BY id ASC LIMIT 1").get(s.id, myAccountId)
    : null;

  const totalEntryFee = tierMeta ? tierMeta.entryFee : s.entry_fee;

  return {
    id: s.id,
    tierId: s.tier_id,
    priceLevel: s.price_level,
    priceLevelName: tierMeta?.priceLevelName || s.price_level,
    icon: tierMeta?.icon || "🎯",
    name: s.name,
    cadence: tierMeta?.cadence || "daily",
    entryFee: totalEntryFee,
    entryFeeUsd: stonkToUsd(totalEntryFee),
    surcharge: tierMeta?.surcharge || 0,
    ticketCost: s.ticket_cost,
    status: s.status,
    opensAt: s.opens_at,
    locksAt: s.locks_at,
    entrantCount,
    poolGross: grossPool,
    ticketsProjected: freerollPrizesAvailable !== null ? freerollPrizesAvailable : (s.status === "open" ? ticketsProjected : s.tickets_funded),
    lifetimeAwarded: freerollLifetimeAwarded,
    ticketsFunded: s.tickets_funded,
    remainderProjected: Math.round(remainderProjected || 0),
    remainderStonk: s.remainder_stonk,
    remainderDisplayName: s.remainder_display_name,
    joined: myEntryCount > 0,
    myEntryCount,
    maxEntriesPerAccount: tierMeta ? tierMeta.maxEntriesPerAccount : 10,
    myPortfolioId: myFirstEntry ? myFirstEntry.portfolio_id : null,
  };
}

router.get("/", (req, res) => {
  let myAccountId = null;
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const { verify } = require("../auth");
    const payload = verify(header.slice(7));
    if (payload) {
      const account = db.prepare("SELECT id FROM accounts WHERE user_id = ?").get(payload.userId);
      if (account) myAccountId = account.id;
    }
  }

  const now = getNow();

  const currentByTier = TIERS.map((tier) => {
    const open = db
      .prepare("SELECT * FROM satellites WHERE tier_id = ? AND price_level = ? AND status = 'open'")
      .get(tier.categoryId, tier.priceLevel);
    if (open) return serializeSatellite(open, myAccountId);

    // No open instance right now — always show the NEXT occurrence with a
    // countdown rather than a dead-end "Locked" display for one that
    // already resolved today. Full results for resolved sessions remain
    // available in the history list below, this is just what the lobby
    // chip shows.
    return serializePendingTier(tier, now, myAccountId);
  });

  // Group into categories for compact display — each category shows its
  // three price levels together, matching a DraftKings-style contest list.
  const categories = CATEGORIES.map((cat) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    cadence: cat.cadence,
    levels: currentByTier.filter((t) => t.tierId === cat.id),
  }));

  const history = db
    .prepare("SELECT * FROM satellites WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 40")
    .all()
    .map((s) => serializeSatellite(s, myAccountId));

  res.json({ categories, history });
});

router.post("/:id/enter", requireAuth, (req, res) => {
  const satellite = db.prepare("SELECT * FROM satellites WHERE id = ?").get(req.params.id);
  if (!satellite) return res.status(404).json({ error: "Satellite not found" });
  if (satellite.status !== "open") return res.status(400).json({ error: "This satellite has locked" });

  const tier = TIERS.find((t) => t.categoryId === satellite.tier_id && t.priceLevel === satellite.price_level);
  if (!tier) return res.status(500).json({ error: "Unknown tier configuration" });

  // Registration windows, by design, differ by category:
  //   Degen Hours (any level) — enter anytime the room's open, right up
  //     until the last 5 minutes. No holds barred means no holds barred.
  //   Race to the Close — same idea, scaled to its own shorter window:
  //     stays open for direct buy-ins the entire 30 minutes, cuts off in
  //     the last 2 minutes rather than 5, proportionally similar.
  //   Every freeroll, any category — stays open the whole session (this
  //     is deliberately the "always something to jump into" entry point,
  //     including Weekly's, which otherwise closes at the opening bell).
  //   Everything else (Full Day/Morning/Afternoon/Weekly PAID tiers) —
  //     registration closes the moment the session actually begins.
  //     Reserve a spot beforehand via the pending-allocation flow instead;
  //     once it's running, no new entries.
  const isDegenHours = satellite.tier_id === "hourly";
  const isRaceToClose = satellite.tier_id === "race_to_close";
  const isFreeroll = satellite.price_level === "free";
  if (isDegenHours || isRaceToClose) {
    const locksAt = new Date(satellite.locks_at).getTime();
    const cutoffMinutes = isDegenHours ? 5 : 2;
    if (Date.now() >= locksAt - cutoffMinutes * 60000) {
      return res.status(400).json({
        error: isDegenHours
          ? "Degen Hours entry closes 5 minutes before the hour ends — this one's cutting it too close."
          : "Race to the Close entry closes in the final 2 minutes — even the finale has to actually finish.",
      });
    }
  } else if (!isFreeroll) {
    return res.status(400).json({ error: "Registration for this contest closed the moment it opened — reserve your spot next time before it starts." });
  }

  const existingCount = db
    .prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ? AND account_id = ?")
    .get(satellite.id, req.account.id).n;
  if (tier.maxEntriesPerAccount != null && existingCount >= tier.maxEntriesPerAccount) {
    return res.status(400).json({
      error:
        tier.maxEntriesPerAccount === 1
          ? "You've already used your one freeroll entry for this room"
          : `You've reached the max of ${tier.maxEntriesPerAccount} entries for this room`,
    });
  }

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.account.id);
  if (account.stonk_balance < tier.entryFee) {
    return res.status(400).json({ error: "Not enough STONK to enter" });
  }

  const label = `${satellite.name} · ${new Date().toLocaleDateString()} (Entry ${existingCount + 1})`;
  const portfolioId = createPortfolio(account.id, label);

  db.exec("BEGIN");
  // Free tiers charge nothing — custodian.debit() correctly refuses a
  // zero amount as a hard validation rule, so this guard is required, not
  // optional. Skipping it here (as this code did until now) meant every
  // single free-tier entry threw an uncaught 500 the moment someone tried
  // to enter — the platform's core "free to join" hook was fully broken.
  if (tier.entryFee > 0) {
    custodian.debit(account.id, tier.entryFee, "satellite_entry", { referenceType: "satellite", referenceId: satellite.id });
  }
  // Charge the TOTAL (base + surcharge), but only the BASE counts toward
  // this room's own pool — matches satellite.entry_fee, which was stored
  // as poolFee at creation time.
  db.prepare(
    "INSERT INTO satellite_entries (satellite_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
  ).run(satellite.id, account.id, portfolioId, tier.poolFee);

  if (tier.surcharge > 0) {
    db.prepare("UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + ? WHERE category_id = ?").run(tier.surcharge, tier.categoryId);
    const fund = db.prepare("SELECT * FROM freeroll_fund WHERE category_id = ?").get(tier.categoryId);
    const threshold = FREEROLL_PRIZE_CONFIG[tier.categoryId].threshold;
    if (fund.accumulated_stonk >= threshold) {
      db.prepare(
        `UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk - ?, prizes_available = prizes_available + 1,
         total_prizes_funded_lifetime = total_prizes_funded_lifetime + 1 WHERE category_id = ?`
      ).run(threshold, tier.categoryId);
    }
  }
  db.exec("COMMIT");

  res.json({ ok: true, satelliteId: satellite.id, portfolioId, entryFeePaid: tier.entryFee });
});

module.exports = router;
