const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const marketQueue = require('../marketQueueV14');

function portfolioForAccount(portfolioId, accountId) {
  return db.prepare('SELECT * FROM portfolios WHERE id=? AND account_id=?').get(portfolioId, accountId) || null;
}
function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
}
function ensureAuditColumns() {
  marketQueue.ensureSchema();
  const cols = tableColumns('market_queue_orders_v14');
  if (!cols.has('cancelled_at')) db.exec('ALTER TABLE market_queue_orders_v14 ADD COLUMN cancelled_at TEXT');
  if (!cols.has('replaced_at')) db.exec('ALTER TABLE market_queue_orders_v14 ADD COLUMN replaced_at TEXT');
}
function dto(r) {
  return {
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
    replacedAt:r.replaced_at || null,
    cancelledAt:r.cancelled_at || null,
    executedAt:r.executed_at,
    executedPrice:r.executed_price,
  };
}
function ownedOrder(id, accountId) {
  ensureAuditColumns();
  return db.prepare(`SELECT q.* FROM market_queue_orders_v14 q
    JOIN portfolios p ON p.id=q.portfolio_id
    WHERE q.id=? AND p.account_id=?`).get(id, accountId) || null;
}

router.get('/', requireAuth, (req, res) => {
  ensureAuditColumns();
  const rows = db.prepare(`SELECT q.* FROM market_queue_orders_v14 q
    JOIN portfolios p ON p.id=q.portfolio_id
    WHERE p.account_id=?
    ORDER BY q.id DESC LIMIT 250`).all(req.account.id);
  res.json(rows.map(dto));
});

router.post('/', requireAuth, (req, res) => {
  const portfolioId = Number(req.body?.portfolioId);
  if (!portfolioId || !portfolioForAccount(portfolioId, req.account.id)) return res.status(404).json({ error:'Portfolio not found' });
  try {
    ensureAuditColumns();
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

router.patch('/:id', requireAuth, (req, res) => {
  const row = ownedOrder(req.params.id, req.account.id);
  if (!row) return res.status(404).json({ error:'Order not found' });
  if (row.status !== 'pending') return res.status(400).json({ error:'Only pending orders can be replaced' });
  if ((row.order_type || 'market') === 'market') return res.status(400).json({ error:'Queued market orders can be cancelled, but not replaced.' });

  const orderType = String(req.body?.orderType || row.order_type || 'limit').toLowerCase();
  if (!['limit','stop','stop_limit'].includes(orderType)) return res.status(400).json({ error:'Order type must be limit, stop, or stop-limit.' });
  const quantity = req.body?.quantity == null ? null : Number(req.body.quantity);
  const percent = req.body?.percent == null ? null : Number(req.body.percent);
  const limitPrice = req.body?.limitPrice == null ? null : Number(req.body.limitPrice);
  const stopPrice = req.body?.stopPrice == null ? null : Number(req.body.stopPrice);
  if (quantity != null && !(quantity > 0)) return res.status(400).json({ error:'Quantity must be positive.' });
  if (percent != null && ![25,50,75,100].includes(percent)) return res.status(400).json({ error:'Percent sizing must be 25, 50, 75, or 100.' });
  if (quantity == null && percent == null && row.quantity == null && row.percent == null) return res.status(400).json({ error:'Enter a quantity or valid percent size.' });
  if (['limit','stop_limit'].includes(orderType) && !(limitPrice > 0)) return res.status(400).json({ error:'Enter a valid limit price.' });
  if (['stop','stop_limit'].includes(orderType) && !(stopPrice > 0)) return res.status(400).json({ error:'Enter a valid stop price.' });

  const nextQuantity = quantity != null ? quantity : (percent != null ? null : row.quantity);
  const nextPercent = percent != null ? percent : (quantity != null ? null : row.percent);
  db.prepare(`UPDATE market_queue_orders_v14
    SET quantity=?, percent=?, order_type=?, limit_price=?, stop_price=?, triggered_at=NULL, replaced_at=CURRENT_TIMESTAMP
    WHERE id=?`).run(nextQuantity, nextPercent, orderType, limitPrice, stopPrice, row.id);
  res.json({ ok:true, order:dto(ownedOrder(row.id, req.account.id)) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = ownedOrder(req.params.id, req.account.id);
  if (!row) return res.status(404).json({ error:'Order not found' });
  if (row.status !== 'pending') return res.status(400).json({ error:'Only pending orders can be cancelled' });
  db.prepare("UPDATE market_queue_orders_v14 SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
  res.json({ ok:true });
});

module.exports = router;
