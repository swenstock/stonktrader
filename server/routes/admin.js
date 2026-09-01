const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { currentStonkUsdPriceMicros } = require("../contestScheduler");
const { markActivatedBrokerDelivered } = require("../activatedBrokerDelivery");

// Minimal admin gate: an allowlist of emails via env var, comma-separated.
// Defaults to empty (nobody has access) so this doesn't accidentally ship
// open. Set ADMIN_EMAILS=you@example.com in your .env to use this.
function requireAdmin(req, res, next) {
  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.length || !allowlist.includes((req.user.email || "").toLowerCase())) {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

// GET /api/admin/revenue — STONK revenue tracked separately from realized
// USD revenue, exactly so token price swings don't make identical player
// activity look artificially better or worse.
router.get("/revenue", requireAuth, requireAdmin, (req, res) => {
  const mainEvents = db
    .prepare(
      `SELECT id, resolved_at, pool_gross, platform_take_stonk, affiliate_paid_stonk, stonk_usd_price, brokers_funded
       FROM contests WHERE status = 'resolved' ORDER BY resolved_at ASC`
    )
    .all();
  const satellites = db
    .prepare(
      `SELECT id, resolved_at, pool_gross, platform_take_stonk, affiliate_paid_stonk, stonk_usd_price, tickets_funded
       FROM satellites WHERE status = 'resolved' ORDER BY resolved_at ASC`
    )
    .all();

  function withUsd(rows, type) {
    return rows.map((r) => ({
      type,
      id: r.id,
      resolvedAt: r.resolved_at,
      grossStonk: r.pool_gross,
      platformTakeStonk: r.platform_take_stonk,
      affiliatePaidStonk: r.affiliate_paid_stonk,
      // realized USD = this period's STONK take valued at THAT period's price
      // snapshot, not today's price — this is the number that actually
      // reflects what the business realized, not what it would be worth if
      // you revalued old revenue at the current (possibly very different) price.
      priceAtResolution: (r.stonk_usd_price || 0) / 1e6,
      platformTakeUsdRealized: Number((((r.platform_take_stonk || 0) * (r.stonk_usd_price || 0)) / 1e6).toFixed(2)),
    }));
  }

  const rows = [...withUsd(mainEvents, "main_event"), ...withUsd(satellites, "satellite")].sort(
    (a, b) => new Date(a.resolvedAt) - new Date(b.resolvedAt)
  );

  const totalPlatformStonk = rows.reduce((s, r) => s + r.platformTakeStonk, 0);
  const totalAffiliateStonk = rows.reduce((s, r) => s + r.affiliatePaidStonk, 0);
  const totalRealizedUsd = rows.reduce((s, r) => s + r.platformTakeUsdRealized, 0);

  const currentPrice = currentStonkUsdPriceMicros() / 1e6;
  const totalStonkValuedAtCurrentPrice = Number((totalPlatformStonk * currentPrice).toFixed(2));

  res.json({
    summary: {
      totalPlatformRevenueStonk: totalPlatformStonk,
      totalAffiliatePaidStonk: totalAffiliateStonk,
      totalRealizedUsdRevenue: Number(totalRealizedUsd.toFixed(2)),
      totalStonkValuedAtCurrentPrice, // for comparison only — NOT the same metric as realized revenue above
      currentStonkPrice: currentPrice,
      note:
        "totalRealizedUsdRevenue values each period's take at that period's own price snapshot. " +
        "totalStonkValuedAtCurrentPrice instead revalues the SAME STONK total at today's price, for " +
        "comparison — the gap between these two numbers is exactly how much token price movement (not " +
        "player activity) has changed the appearance of your revenue.",
    },
    periods: rows,
  });
});

router.post("/junior-broker-redemptions/:redemptionId/deliver", requireAuth, requireAdmin, (req, res) => {
  try {
    const delivery = markActivatedBrokerDelivered(db, { redemptionId: req.params.redemptionId });
    return res.json(delivery);
  } catch (err) {
    if (err && err.code === 'REDEMPTION_NOT_FOUND') {
      return res.status(404).json({ error: 'Redemption not found' });
    }
    if (err && err.code === 'DELIVERY_TIMESTAMP_MISSING') {
      return res.status(409).json({ error: 'Delivered redemption is missing delivery timestamp' });
    }
    if (err && err.code === 'INVALID_REDEMPTION_STATUS') {
      return res.status(409).json({ error: 'Redemption cannot be delivered from its current status' });
    }
    console.error('Activated broker delivery failed', err);
    return res.status(500).json({ error: 'Activated broker delivery failed' });
  }
});

module.exports = router;
module.exports.requireAdmin = requireAdmin;
