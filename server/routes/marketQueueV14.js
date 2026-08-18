const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const marketQueue = require('../marketQueueV14');
const { getQuote, MIN_MARKET_CAP } = require('../dataProvider');

function isDegenPortfolio(portfolioId) {
  const row = db.prepare(`SELECT satellites.tier_id FROM satellite_entries
    JOIN satellites ON satellites.id = satellite_entries.satellite_id
    WHERE satellite_entries.portfolio_id = ?`).get(portfolioId);
  return row?.tier_id === 'hourly';
}

function enqueueDegenTarget(portfolioId, body, targetOpenAt) {
  marketQueue.ensureSchema();
  const symbol = String(body.symbol || '').trim().toUpperCase();
  const side = String(body.side || '').trim().toLowerCase();
  const pct = Number(body.targetPortfolioPct);
  if (!symbol || side !== 'buy') throw new Error('Degen basket target requires a buy symbol.');
  if (!(pct > 0 && pct <= 100)) throw new Error('Degen basket target must be greater than 0% and no more than 100%.');
  const quote = getQuote(symbol);
  if (!quote) throw new Error(`${symbol} is not available in SBC.`);
  if (quote.marketCap != null && quote.marketCap < MIN_MARKET_CAP) throw new Error(`${symbol} is below the SBC market-cap minimum.`);
  const info = db.prepare(`INSERT INTO market_queue_orders_v14
    (portfolio_id, symbol, side, quantity, percent, max_allotment, target_portfolio_pct, order_type)
    VALUES (?, ?, 'buy', NULL, NULL, 0, ?, 'market')`).run(portfolioId, symbol, pct);
  return { id:Number(info.lastInsertRowid), symbol, side:'buy', targetPortfolioPct:pct, targetOpenAt };
}

router.post('/:id/trades', requireAuth, (req, res, next) => {
  const portfolio = db.prepare('SELECT * FROM portfolios WHERE id = ?').get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) {
    return res.status(404).json({ error:'Portfolio not found' });
  }

  const eligibility = marketQueue.queueEligibility(portfolio.id);
  if (!eligibility.marketClosed) return next();
  if (!eligibility.queueable) {
    return res.status(400).json({ code:'QUEUE_UNAVAILABLE', error:eligibility.reason || 'This order cannot be queued.' });
  }

  try {
    const body = req.body || {};
    const target = Number(body.targetPortfolioPct);
    const queued = isDegenPortfolio(portfolio.id) && target > 10
      ? enqueueDegenTarget(portfolio.id, body, eligibility.targetOpenAt?.toISOString?.() || null)
      : marketQueue.enqueue(portfolio.id, body);
    return res.status(202).json({
      ok:true,
      queued:true,
      queueId:queued.id,
      symbol:queued.symbol,
      side:queued.side,
      targetOpenAt:queued.targetOpenAt,
      message:'The market is currently closed. Your order is in the queue and will be rechecked against SBC rules at the next eligible market open.',
    });
  } catch (e) {
    return res.status(400).json({ code:'QUEUE_REJECTED', error:String(e.message || e) });
  }
});

module.exports = router;
