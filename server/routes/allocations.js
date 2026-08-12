const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { validateAllocations } = require("../allocationEngine");
const { TIERS } = require("../satelliteScheduler");

function serialize(r) {
  return {
    id: r.id,
    targetType: r.target_type,
    targetTierId: r.target_tier_id,
    targetPriceLevel: r.target_price_level,
    allocations: JSON.parse(r.allocations_json),
    status: r.status,
    failReason: r.fail_reason,
    createdAt: r.created_at,
    appliedAt: r.applied_at,
  };
}

router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM pending_allocations WHERE account_id = ? ORDER BY id DESC LIMIT 30")
    .all(req.account.id);
  res.json(rows.map(serialize));
});

router.post("/", requireAuth, (req, res) => {
  const { targetType, tierId, priceLevel, allocations } = req.body || {};

  if (!["contest", "satellite"].includes(targetType)) {
    return res.status(400).json({ error: "targetType must be 'contest' or 'satellite'" });
  }

  let finalTierId, finalPriceLevel;
  if (targetType === "satellite") {
    const validTier = TIERS.find((t) => t.categoryId === tierId && t.priceLevel === priceLevel);
    if (!validTier) return res.status(400).json({ error: "Unknown satellite tier/price level" });
    finalTierId = tierId;
    finalPriceLevel = priceLevel;
  } else {
    finalTierId = "main_event";
    finalPriceLevel = null;
  }

  const err = validateAllocations(allocations);
  if (err) return res.status(400).json({ error: err });

  // Replace any existing pending allocation for this exact same target —
  // one-time use, latest set wins.
  db.prepare(
    `UPDATE pending_allocations SET status = 'cancelled'
     WHERE account_id = ? AND target_type = ? AND target_tier_id = ?
     AND IFNULL(target_price_level, '') = IFNULL(?, '') AND status = 'pending'`
  ).run(req.account.id, targetType, finalTierId, finalPriceLevel);

  const info = db
    .prepare(
      "INSERT INTO pending_allocations (account_id, target_type, target_tier_id, target_price_level, allocations_json) VALUES (?, ?, ?, ?, ?)"
    )
    .run(req.account.id, targetType, finalTierId, finalPriceLevel, JSON.stringify(allocations));

  res.json({ ok: true, id: info.lastInsertRowid });
});

router.delete("/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM pending_allocations WHERE id = ?").get(req.params.id);
  if (!row || row.account_id !== req.account.id) return res.status(404).json({ error: "Not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Only pending allocations can be cancelled" });
  db.prepare("UPDATE pending_allocations SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
