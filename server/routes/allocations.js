const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { validateAllocations } = require("../allocationEngine");
const { TIERS } = require("../satelliteScheduler");
const { CONFIG: MAIN_EVENT_CONFIG } = require("../contestScheduler");

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

// POST — reserve a NEW spot. Stacks up to the tier's max entries per
// account rather than replacing any existing reservation — each call adds
// another one, matching how entering an already-open room works.
router.post("/", requireAuth, (req, res) => {
  const { targetType, tierId, priceLevel, allocations } = req.body || {};

  if (!["contest", "satellite"].includes(targetType)) {
    return res.status(400).json({ error: "targetType must be 'contest' or 'satellite'" });
  }

  let finalTierId, finalPriceLevel, maxAllowed;
  if (targetType === "satellite") {
    const validTier = TIERS.find((t) => t.categoryId === tierId && t.priceLevel === priceLevel);
    if (!validTier) return res.status(400).json({ error: "Unknown satellite tier/price level" });
    finalTierId = tierId;
    finalPriceLevel = priceLevel;
    maxAllowed = validTier.maxEntriesPerAccount;
  } else {
    finalTierId = "main_event";
    finalPriceLevel = null;
    maxAllowed = MAIN_EVENT_CONFIG.maxEntriesPerAccount;
  }

  const err = validateAllocations(allocations);
  if (err) return res.status(400).json({ error: err });

  const existingCount = db
    .prepare(
      `SELECT COUNT(*) as n FROM pending_allocations
       WHERE account_id = ? AND target_type = ? AND target_tier_id = ?
       AND IFNULL(target_price_level, '') = IFNULL(?, '') AND status = 'pending'`
    )
    .get(req.account.id, targetType, finalTierId, finalPriceLevel).n;

  if (existingCount >= maxAllowed) {
    return res.status(400).json({ error: `You've reached the max of ${maxAllowed} entries for this room` });
  }

  const info = db
    .prepare(
      "INSERT INTO pending_allocations (account_id, target_type, target_tier_id, target_price_level, allocations_json) VALUES (?, ?, ?, ?, ?)"
    )
    .run(req.account.id, targetType, finalTierId, finalPriceLevel, JSON.stringify(allocations));

  res.json({ ok: true, id: info.lastInsertRowid });
});

// PUT — edit ONE specific existing reservation's picks, without touching
// any of the account's other reservations for the same room.
router.put("/:id", requireAuth, (req, res) => {
  const { allocations } = req.body || {};
  const row = db.prepare("SELECT * FROM pending_allocations WHERE id = ?").get(req.params.id);
  if (!row || row.account_id !== req.account.id) return res.status(404).json({ error: "Not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Only pending reservations can be adjusted" });

  const err = validateAllocations(allocations);
  if (err) return res.status(400).json({ error: err });

  db.prepare("UPDATE pending_allocations SET allocations_json = ? WHERE id = ?").run(
    JSON.stringify(allocations),
    req.params.id
  );
  res.json({ ok: true });
});

router.delete("/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM pending_allocations WHERE id = ?").get(req.params.id);
  if (!row || row.account_id !== req.account.id) return res.status(404).json({ error: "Not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Only pending allocations can be cancelled" });
  db.prepare("UPDATE pending_allocations SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
