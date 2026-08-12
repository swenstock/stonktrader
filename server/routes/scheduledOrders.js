const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { validateAllocations } = require("../allocationEngine");
const { nextMarketOpen } = require("../timeHelpers");

router.get("/", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT scheduled_orders.* FROM scheduled_orders
       JOIN portfolios ON portfolios.id = scheduled_orders.portfolio_id
       WHERE portfolios.account_id = ? ORDER BY scheduled_orders.id DESC LIMIT 30`
    )
    .all(req.account.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      portfolioId: r.portfolio_id,
      allocations: JSON.parse(r.allocations_json),
      targetOpenAt: r.target_open_at,
      status: r.status,
      failReason: r.fail_reason,
      createdAt: r.created_at,
      appliedAt: r.applied_at,
    }))
  );
});

router.post("/", requireAuth, (req, res) => {
  const { portfolioId, allocations } = req.body || {};
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId);
  if (!portfolio || portfolio.account_id !== req.account.id) {
    return res.status(404).json({ error: "Portfolio not found" });
  }

  const err = validateAllocations(allocations);
  if (err) return res.status(400).json({ error: err });

  // Only one pending scheduled order per portfolio — latest set wins.
  db.prepare(
    "UPDATE scheduled_orders SET status = 'cancelled' WHERE portfolio_id = ? AND status = 'pending'"
  ).run(portfolioId);

  const targetOpenAt = nextMarketOpen(new Date());
  const info = db
    .prepare(
      "INSERT INTO scheduled_orders (portfolio_id, allocations_json, target_open_at) VALUES (?, ?, ?)"
    )
    .run(portfolioId, JSON.stringify(allocations), targetOpenAt.toISOString());

  res.json({ ok: true, id: info.lastInsertRowid, targetOpenAt: targetOpenAt.toISOString() });
});

router.delete("/:id", requireAuth, (req, res) => {
  const row = db
    .prepare(
      `SELECT scheduled_orders.* FROM scheduled_orders
       JOIN portfolios ON portfolios.id = scheduled_orders.portfolio_id
       WHERE scheduled_orders.id = ? AND portfolios.account_id = ?`
    )
    .get(req.params.id, req.account.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.status !== "pending") return res.status(400).json({ error: "Only pending orders can be cancelled" });
  db.prepare("UPDATE scheduled_orders SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
