'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const custodian = require('../custodian');
const requireAuth = require('../middleware/requireAuth');
const { verify } = require('../auth');
const market = require('../badgeMarketV45');

function optionalAccountId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const payload = verify(header.slice(7));
  if (!payload) return null;
  return db.prepare('SELECT id FROM accounts WHERE user_id=?').get(payload.userId)?.id || null;
}
function sendError(res, err) {
  const code = err?.code;
  if (code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
  if (code === 'INSUFFICIENT_UNLISTED_QUANTITY' || code === 'BADGE_RESERVATION_MISSING') return res.status(409).json({ error: err.message });
  if (/Not enough STONK|positive number|own Badge|available to sell|active/.test(String(err?.message))) return res.status(400).json({ error: err.message });
  console.error('Badge market request failed', err);
  return res.status(500).json({ error: 'Badge market request failed' });
}

router.get('/book', (req, res) => {
  try { res.json(market.book(db, optionalAccountId(req))); }
  catch (err) { sendError(res, err); }
});
router.get('/reference', (req, res) => {
  try { res.json({ reference: market.currentReferencePrice(db), threshold: market.MISPRICING_THRESHOLD, floor: market.BADGE_FLOOR_STONK, mintCeiling: market.MINT_PRICE_STONK }); }
  catch (err) { sendError(res, err); }
});
router.post('/listings', requireAuth, (req, res) => {
  try { res.json({ ok:true, ...market.createListing(db, { accountId:req.account.id, askPrice:req.body?.askPrice }) }); }
  catch (err) { sendError(res, err); }
});
router.delete('/listings/:id', requireAuth, (req, res) => {
  try { res.json(market.cancelListing(db, { accountId:req.account.id, listingId:Number(req.params.id) })); }
  catch (err) { sendError(res, err); }
});
router.post('/listings/:id/buy', requireAuth, (req, res) => {
  try { res.json(market.buyListing(db, custodian, { accountId:req.account.id, listingId:Number(req.params.id) })); }
  catch (err) { sendError(res, err); }
});
router.post('/bids', requireAuth, (req, res) => {
  try { res.json({ ok:true, ...market.createBid(db, custodian, { accountId:req.account.id, bidPrice:req.body?.bidPrice }) }); }
  catch (err) { sendError(res, err); }
});
router.delete('/bids/:id', requireAuth, (req, res) => {
  try { res.json(market.cancelBid(db, custodian, { accountId:req.account.id, bidId:Number(req.params.id) })); }
  catch (err) { sendError(res, err); }
});
router.post('/bids/:id/sell', requireAuth, (req, res) => {
  try { res.json(market.sellToBid(db, custodian, { accountId:req.account.id, bidId:Number(req.params.id) })); }
  catch (err) { sendError(res, err); }
});
router.post('/mint', requireAuth, (req, res) => {
  try {
    const out = market.mintBadge(db, custodian, { accountId:req.account.id });
    res.json({ ok:true, paid:out.paid, issuanceId:out.issuanceId, brokerSubunits:out.brokerSubunits.toString(), overflowSubunits:out.overflowSubunits.toString(), owned:Number(out.holding.quantity), listed:Number(out.holding.quantity_listed) });
  } catch (err) { sendError(res, err); }
});

module.exports = router;
