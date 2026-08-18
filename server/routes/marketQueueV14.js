const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');
const marketQueue = require('../marketQueueV14');

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
    const queued = marketQueue.enqueue(portfolio.id, req.body || {});
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
