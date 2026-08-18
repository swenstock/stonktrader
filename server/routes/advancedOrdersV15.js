const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const marketQueue = require('../marketQueueV14');

function portfolioForAccount(portfolioId, accountId) {
  return db.prepare('SELECT * FROM portfolios WHERE id=? AND account_id=?').get(portfolioId, accountId) || null;
}

router.get('/', requireAuth, (req, res) => {
  marketQueue.ensureSchema();
  const rows = db.prepare(`SELECT q.* FROM market_queue_orders_v14 q
    JOIN portfolios p ON p.id=q.portfolio_id
    WHERE p.account_id=? AND COALESCE(q.order_type,'market')!='market'
    ORDER BY q.id DESC LIMIT 100`).all(req.account.id);
  res.json(rows.map(r => ({
    id:r.id,
    portfolioId:r.portfolio_id,
    symbol:r.symbol,
    side:r.side,
    orderType:r.order_type || 'market',
    quantity:r.quantity,
    percent:r.percent,
    limitPrice:r.limit_price,
    stopPrice:r.stop_price,
    triggeredAt:r.triggered_at,
    status:r.status,
    failReason:r.fail_reason,
    createdAt:r.created_at,
    executedAt:r.executed_at,
    executedPrice:r.executed_price,
  })));
});

router.post('/', requireAuth, (req, res) => {
  const portfolioId = Number(req.body?.portfolioId);
  if (!portfolioId || !portfolioForAccount(portfolioId, req.account.id)) return res.status(404).json({ error:'Portfolio not found' });
  try {
    const queued = marketQueue.enqueueAdvanced(portfolioId, req.body || {});
    const typeLabel = queued.orderType.replace('_',' ').toUpperCase();
    res.status(202).json({
      ok:true,
      queued:true,
      id:queued.id,
      orderType:queued.orderType,
      targetOpenAt:queued.targetOpenAt,
      message:queued.targetOpenAt
        ? `${typeLabel} order accepted. The market is currently closed, so SBC will begin monitoring it at the next eligible market open.`
        : `${typeLabel} order accepted. SBC is monitoring it against the live simulated quote.`,
    });
  } catch (e) {
    res.status(400).json({ error:String(e.message || e) });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  marketQueue.ensureSchema();
  const row = db.prepare(`SELECT q.* FROM market_queue_orders_v14 q
    JOIN portfolios p ON p.id=q.portfolio_id
    WHERE q.id=? AND p.account_id=?`).get(req.params.id, req.account.id);
  if (!row) return res.status(404).json({ error:'Order not found' });
  if (row.status !== 'pending') return res.status(400).json({ error:'Only pending orders can be cancelled' });
  db.prepare("UPDATE market_queue_orders_v14 SET status='cancelled' WHERE id=?").run(row.id);
  res.json({ ok:true });
});

module.exports = router;
