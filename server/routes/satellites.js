const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { totalValueForAccount } = require("../portfolioValue");
const { TIERS } = require("../satelliteScheduler");
const { isWeekday, etCalendarDate, etDateTime, currentWeekWindow } = require("../timeHelpers");

const TIER_META = Object.fromEntries(TIERS.map((t) => [t.id, t]));

function hourToParts(hourFloat) {
  const hour = Math.floor(hourFloat);
  const minute = Math.round((hourFloat - hour) * 60);
  return { hour, minute };
}

// Computes when this tier's session will next actually be open — used only
// when no satellite row exists yet for "today" (e.g. it's before 9:30am ET,
// or a weekend), so the lobby can show "Opens Tue 9:30 AM ET" instead of
// the box just vanishing.
function nextOccurrence(tier, now) {
  if (tier.cadence === "weekly") {
    const { weekStart } = currentWeekWindow(now);
    return weekStart;
  }

  let probe = new Date(now);
  for (let i = 0; i < 8; i++) {
    if (isWeekday(probe)) {
      const { year, month, day } = etCalendarDate(probe);
      const o = hourToParts(tier.openHour);
      const l = hourToParts(tier.lockHour);
      const opensAt = etDateTime(year, month, day, o.hour, o.minute, 0);
      const locksAt = etDateTime(year, month, day, l.hour, l.minute, 0);
      if (now.getTime() < locksAt.getTime()) return opensAt; // today's window hasn't locked yet
    }
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000); // try the next calendar day
  }
  return now; // fallback, should never realistically hit
}

function serializePendingTier(tier, now) {
  const opensAt = nextOccurrence(tier, now);
  return {
    id: null,
    tierId: tier.id,
    icon: tier.icon,
    name: tier.name,
    cadence: tier.cadence,
    entryFee: tier.entryFee,
    ticketCost: 3000,
    status: "pending",
    opensAt: opensAt.toISOString(),
    locksAt: null,
    entrantCount: 0,
    poolGross: 0,
    ticketsProjected: 0,
    ticketsFunded: null,
    remainderStonk: null,
    remainderDisplayName: null,
    joined: false,
  };
}

function serializeSatellite(s, myAccountId) {
  const entrantCount = db
    .prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ?")
    .get(s.id).n;
  const grossPool = s.status === "open" ? entrantCount * s.entry_fee : s.pool_gross;
  const playerPool = grossPool * 0.85;
  const ticketsProjected = Math.floor(playerPool / s.ticket_cost);

  const myEntry = myAccountId
    ? db.prepare("SELECT id FROM satellite_entries WHERE satellite_id = ? AND account_id = ?").get(s.id, myAccountId)
    : null;

  return {
    id: s.id,
    tierId: s.tier_id,
    icon: TIER_META[s.tier_id]?.icon || "🎯",
    name: s.name,
    cadence: TIER_META[s.tier_id]?.cadence || "daily",
    entryFee: s.entry_fee,
    ticketCost: s.ticket_cost,
    status: s.status,
    opensAt: s.opens_at,
    locksAt: s.locks_at,
    entrantCount,
    poolGross: grossPool,
    ticketsProjected: s.status === "open" ? ticketsProjected : s.tickets_funded,
    ticketsFunded: s.tickets_funded,
    remainderStonk: s.remainder_stonk,
    remainderDisplayName: s.remainder_display_name,
    joined: !!myEntry,
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

  const now = new Date();

  // Every tier always shows a card — open, most-recently-resolved, or (if
  // neither exists yet today, e.g. it's before 9:30am ET) a synthesized
  // "pending" state showing when it next opens for real.
  const current = TIERS.map((tier) => {
    const open = db.prepare("SELECT * FROM satellites WHERE tier_id = ? AND status = 'open'").get(tier.id);
    if (open) return serializeSatellite(open, myAccountId);

    const lastResolved = db
      .prepare("SELECT * FROM satellites WHERE tier_id = ? ORDER BY id DESC LIMIT 1")
      .get(tier.id);
    // Only reuse a resolved row if it's from TODAY's (or this week's, for
    // the qualifier) window — otherwise it's stale and we want "pending" for
    // the next real occurrence instead of showing yesterday's result as if
    // it were current.
    if (lastResolved) {
      const opensAtDate = new Date(lastResolved.opens_at);
      const isSameOccurrence =
        tier.cadence === "weekly"
          ? currentWeekWindow(now).weekStart.getTime() === opensAtDate.getTime()
          : opensAtDate.toDateString() === now.toDateString();
      if (isSameOccurrence) return serializeSatellite(lastResolved, myAccountId);
    }

    return serializePendingTier(tier, now);
  });

  const history = db
    .prepare("SELECT * FROM satellites WHERE status = 'resolved' ORDER BY resolved_at DESC LIMIT 30")
    .all()
    .map((s) => serializeSatellite(s, myAccountId));

  res.json({ tiers: current, history });
});

router.post("/:id/enter", requireAuth, (req, res) => {
  const satellite = db.prepare("SELECT * FROM satellites WHERE id = ?").get(req.params.id);
  if (!satellite) return res.status(404).json({ error: "Satellite not found" });
  if (satellite.status !== "open") return res.status(400).json({ error: "This satellite has locked" });

  const existing = db
    .prepare("SELECT id FROM satellite_entries WHERE satellite_id = ? AND account_id = ?")
    .get(satellite.id, req.account.id);
  if (existing) return res.status(400).json({ error: "You're already in this satellite" });

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.account.id);
  if (account.stonk_balance < satellite.entry_fee) {
    return res.status(400).json({ error: "Not enough STONK to enter" });
  }

  const startingValue = totalValueForAccount(account.id);

  db.exec("BEGIN");
  db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(
    satellite.entry_fee,
    account.id
  );
  db.prepare(
    "INSERT INTO satellite_entries (satellite_id, account_id, entry_fee_paid, starting_value) VALUES (?, ?, ?, ?)"
  ).run(satellite.id, account.id, satellite.entry_fee, startingValue);
  db.exec("COMMIT");

  res.json({ ok: true, satelliteId: satellite.id, entryFeePaid: satellite.entry_fee });
});

module.exports = router;
