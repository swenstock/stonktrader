const express = require("express");
const router = express.Router();
const db = require("../db");
const custodian = require("../custodian");
const { getNow } = require("../testClock");
const requireAuth = require("../middleware/requireAuth");
const { createPortfolio } = require("../portfolioValue");
const { TIERS, CATEGORIES, FREEROLL_PRIZE_CONFIG } = require("../tierConfig");
const { computeCascadingContest, computeFreerollRequirement } = require("../payoutEngineV2");
const freerollReserve = require("../freerollReserveV45");
const { currentStonkUsdPriceMicros } = require("../contestScheduler");
const { isWeekday, etCalendarDate, etDateTime, easternParts, currentWeekWindow } = require("../timeHelpers");

const V45_ENABLED = process.env.PAYOUT_ENGINE_V45 === "true";
const PRICE_LEVEL_TO_TIER = { runner: "runner", low: "clerk", mid: "trader", high: "junior" };

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

function v45Projection(priceLevel, entrantCount, categoryId) {
  if (!V45_ENABLED || entrantCount < 1) return null;
  if (priceLevel === "free") {
    const req = computeFreerollRequirement({ fieldSize: entrantCount });
    const reserveBalance = Number(freerollReserve.get(categoryId)?.balance_stonk || 0);
    return {
      engine: "v45",
      status: reserveBalance >= req.liabilityRequired ? "FUNDED" : "RESERVE_SHORTFALL",
      paidPlaces: req.paidPlaces,
      baselineTicketType: "runner",
      baselineTicketsEach: 2,
      totalTicketsRequired: req.ticketsRequired,
      reserveRequired: req.liabilityRequired,
      reserveAvailable: reserveBalance,
      reserveShortfall: Math.max(0, req.liabilityRequired - reserveBalance),
      mainEventTickets: 0,
      cashPrizePlaces: 0,
    };
  }
  const tierKey = PRICE_LEVEL_TO_TIER[priceLevel];
  if (!tierKey) return null;
  const math = computeCascadingContest({ tierKey, fieldSize: entrantCount });
  const baselinePlaces = math.payouts.filter(p => p.quantity > 0 && p.ticketTier !== "main_event").length;
  return {
    engine: "v45",
    status: math.status,
    degraded: !!math.degraded,
    paidPlaces: math.paidPlaces,
    mainEventTickets: math.mainEventTickets || 0,
    lowerTierPaidPlaces: baselinePlaces,
    lowerTierTickets: math.payouts.filter(p => p.quantity > 0 && p.ticketTier !== "main_event").reduce((n,p)=>n+p.quantity,0),
    cashPrizePlaces: math.cashPrizePlaces || math.payouts.filter(p => p.quantity === 0 && p.stonkBonus > 0).length,
    lowerTierTicketLiability: math.lowerTierTicketLiability || 0,
    contestPrizePool: math.contestPrizePool,
    residualBonuses: math.residualBonuses || 0,
    shortfall: 0,
  };
}

function serializePendingTier(tier, now, myAccountId) {
  const myPendingCount = myAccountId
    ? db.prepare(`SELECT COUNT(*) as n FROM pending_allocations
        WHERE account_id = ? AND target_type = 'satellite' AND target_tier_id = ?
        AND IFNULL(target_price_level, '') = IFNULL(?, '') AND status = 'pending'`)
        .get(myAccountId, tier.categoryId, tier.priceLevel).n
    : 0;
  const reserveBalance = tier.priceLevel === "free"
    ? Number(freerollReserve.get(tier.categoryId)?.balance_stonk || 0)
    : null;
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
    contestPortion: tier.poolFee,
    freerollContribution: tier.surcharge,
    status: "pending",
    opensAt: nextOccurrence(tier, now).toISOString(),
    locksAt: null,
    entrantCount: 0,
    reserveAvailable: reserveBalance,
    payoutProjection: null,
    joined: myPendingCount > 0,
    myEntryCount: myPendingCount,
    maxEntriesPerAccount: tier.maxEntriesPerAccount,
  };
}

function serializeSatellite(s, myAccountId) {
  const entrantCount = db.prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ?").get(s.id).n;
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
    contestPortion: tierMeta?.poolFee ?? s.entry_fee,
    freerollContribution: tierMeta?.surcharge || 0,
    status: s.status,
    opensAt: s.opens_at,
    locksAt: s.locks_at,
    entrantCount,
    poolGross: Number(s.pool_gross || 0),
    playerPool: Number(s.player_pool || 0),
    ticketsFunded: Number(s.tickets_funded || 0),
    remainderStonk: Number(s.remainder_stonk || 0),
    settlementVersion: s.settlement_version || "legacy",
    settlementError: s.settlement_error || null,
    payoutProjection: s.status === "open" ? v45Projection(s.price_level, entrantCount, s.tier_id) : null,
    reserveAvailable: s.price_level === "free" ? Number(freerollReserve.get(s.tier_id)?.balance_stonk || 0) : null,
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
    const open = db.prepare("SELECT * FROM satellites WHERE tier_id = ? AND price_level = ? AND status = 'open'")
      .get(tier.categoryId, tier.priceLevel);
    if (open) return serializeSatellite(open, myAccountId);
    return serializePendingTier(tier, now, myAccountId);
  });
  const categories = CATEGORIES.map((cat) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    cadence: cat.cadence,
    levels: currentByTier.filter((t) => t.tierId === cat.id),
  }));
  const history = db.prepare("SELECT * FROM satellites WHERE status IN ('resolved','blocked') ORDER BY COALESCE(resolved_at, locks_at) DESC LIMIT 60")
    .all().map((s) => serializeSatellite(s, myAccountId));
  res.json({
    payoutEngine: V45_ENABLED ? "v45" : "legacy",
    categories,
    history,
  });
});

router.post("/:id/enter", requireAuth, (req, res) => {
  const satellite = db.prepare("SELECT * FROM satellites WHERE id = ?").get(req.params.id);
  if (!satellite) return res.status(404).json({ error: "Satellite not found" });
  if (satellite.status !== "open") return res.status(400).json({ error: "This satellite is not open" });
  const tier = TIERS.find((t) => t.categoryId === satellite.tier_id && t.priceLevel === satellite.price_level);
  if (!tier) return res.status(500).json({ error: "Unknown tier configuration" });

  const nowMs = getNow().getTime();
  const isDegenHours = satellite.tier_id === "hourly";
  const isRaceToClose = satellite.tier_id === "race_to_close";
  const isFreeroll = satellite.price_level === "free";
  if (isDegenHours || isRaceToClose) {
    const locksAt = new Date(satellite.locks_at).getTime();
    const cutoffMinutes = isDegenHours ? 5 : 2;
    if (nowMs >= locksAt - cutoffMinutes * 60000) {
      return res.status(400).json({
        code: "ENTRY_CUTOFF_REACHED",
        error: isDegenHours
          ? "Degen Hours entry closes 5 minutes before the hour ends."
          : "Race to the Close entry closes in the final 2 minutes.",
      });
    }
  } else if (!isFreeroll) {
    return res.status(400).json({ error: "Registration for this contest closed when it opened. Reserve the next occurrence instead." });
  }

  const existingCount = db.prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ? AND account_id = ?")
    .get(satellite.id, req.account.id).n;
  if (tier.maxEntriesPerAccount != null && existingCount >= tier.maxEntriesPerAccount) {
    return res.status(400).json({
      error: tier.maxEntriesPerAccount === 1
        ? "You've already used your one freeroll entry for this room"
        : `You've reached the max of ${tier.maxEntriesPerAccount} entries for this room`,
    });
  }

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.account.id);
  if (account.stonk_balance < tier.entryFee) return res.status(400).json({ error: "Not enough STONK to enter" });
  const label = `${satellite.name} (Entry ${existingCount + 1})`;
  const portfolioId = createPortfolio(account.id, label);

  db.exec("BEGIN");
  try {
    if (tier.entryFee > 0) {
      custodian.debit(account.id, tier.entryFee, "satellite_entry", { referenceType: "satellite", referenceId: satellite.id });
    }
    db.prepare("INSERT INTO satellite_entries (satellite_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)")
      .run(satellite.id, account.id, portfolioId, tier.poolFee);

    if (tier.surcharge > 0) {
      db.prepare("UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + ? WHERE category_id = ?")
        .run(tier.surcharge, tier.categoryId);
      if (!V45_ENABLED) {
        const fund = db.prepare("SELECT * FROM freeroll_fund WHERE category_id = ?").get(tier.categoryId);
        const threshold = FREEROLL_PRIZE_CONFIG[tier.categoryId].threshold;
        if (fund.accumulated_stonk >= threshold) {
          db.prepare(`UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk - ?, prizes_available = prizes_available + 1,
            total_prizes_funded_lifetime = total_prizes_funded_lifetime + 1 WHERE category_id = ?`)
            .run(threshold, tier.categoryId);
        }
      }
    }
    db.exec("COMMIT");
    res.json({ ok: true, satelliteId: satellite.id, portfolioId, entryFeePaid: tier.entryFee });
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    throw err;
  }
});

module.exports = router;
