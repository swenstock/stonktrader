const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { createPortfolio } = require("../portfolioValue");
const { TIERS, CATEGORIES } = require("../satelliteScheduler");
const { isWeekday, etCalendarDate, etDateTime, currentWeekWindow } = require("../timeHelpers");

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

function serializePendingTier(tier, now) {
  return {
    id: null,
    tierId: tier.categoryId,
    priceLevel: tier.priceLevel,
    icon: tier.icon,
    name: tier.name,
    cadence: tier.cadence,
    entryFee: tier.entryFee,
    status: "pending",
    opensAt: nextOccurrence(tier, now).toISOString(),
    locksAt: null,
    entrantCount: 0,
    poolGross: 0,
    ticketsProjected: 0,
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
    ? db.prepare("SELECT * FROM satellite_entries WHERE satellite_id = ? AND account_id = ?").get(s.id, myAccountId)
    : null;

  const tierMeta = TIERS.find((t) => t.categoryId === s.tier_id && t.priceLevel === s.price_level);

  return {
    id: s.id,
    tierId: s.tier_id,
    priceLevel: s.price_level,
    icon: tierMeta?.icon || "🎯",
    name: s.name,
    cadence: tierMeta?.cadence || "daily",
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
    myPortfolioId: myEntry ? myEntry.portfolio_id : null,
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

  const currentByTier = TIERS.map((tier) => {
    const open = db
      .prepare("SELECT * FROM satellites WHERE tier_id = ? AND price_level = ? AND status = 'open'")
      .get(tier.categoryId, tier.priceLevel);
    if (open) return serializeSatellite(open, myAccountId);

    const lastResolved = db
      .prepare("SELECT * FROM satellites WHERE tier_id = ? AND price_level = ? ORDER BY id DESC LIMIT 1")
      .get(tier.categoryId, tier.priceLevel);
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

  const existing = db
    .prepare("SELECT id FROM satellite_entries WHERE satellite_id = ? AND account_id = ?")
    .get(satellite.id, req.account.id);
  if (existing) return res.status(400).json({ error: "You're already in this satellite" });

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(req.account.id);
  if (account.stonk_balance < satellite.entry_fee) {
    return res.status(400).json({ error: "Not enough STONK to enter" });
  }

  const portfolioId = createPortfolio(account.id, `${satellite.name} · ${new Date().toLocaleDateString()}`);

  db.exec("BEGIN");
  db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(
    satellite.entry_fee,
    account.id
  );
  db.prepare(
    "INSERT INTO satellite_entries (satellite_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
  ).run(satellite.id, account.id, portfolioId, satellite.entry_fee);
  db.exec("COMMIT");

  res.json({ ok: true, satelliteId: satellite.id, portfolioId, entryFeePaid: satellite.entry_fee });
});

module.exports = router;
