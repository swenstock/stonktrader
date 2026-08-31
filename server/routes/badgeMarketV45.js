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
function positivePrice(value, label) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be a positive number`);
  return n;
}
function activityStatus(status) {
  if (status === 'active') return 'working';
  if (status === 'sold' || status === 'filled') return 'filled';
  return 'cancelled';
}

router.get('/book', (req, res) => {
  try { res.json(market.book(db, optionalAccountId(req))); }
  catch (err) { sendError(res, err); }
});
router.get('/reference', (req, res) => {
  try { res.json({ reference: market.currentReferencePrice(db), threshold: market.MISPRICING_THRESHOLD, floor: market.BADGE_FLOOR_STONK, mintCeiling: market.MINT_PRICE_STONK }); }
  catch (err) { sendError(res, err); }
});
router.get('/mine', requireAuth, (req, res) => {
  try {
    market.ensureSchema(db);
    const accountId = req.account.id;
    const listings = db.prepare(`SELECT * FROM badge_listings WHERE seller_account_id=? OR buyer_account_id=? ORDER BY id DESC LIMIT 100`).all(accountId, accountId);
    const bids = db.prepare(`SELECT * FROM badge_bids WHERE buyer_account_id=? OR seller_account_id=? ORDER BY id DESC LIMIT 100`).all(accountId, accountId);
    res.json({
      listings: listings.map(x => ({
        id:Number(x.id), side:'offer', instrument:'badge', status:activityStatus(x.status), rawStatus:x.status,
        price:Number(x.ask_price), askPrice:Number(x.ask_price), createdAt:x.created_at, filledAt:x.sold_at, cancelledAt:x.cancelled_at,
        platformFee:Number(x.platform_fee_stonk||0), role:Number(x.seller_account_id)===accountId?'seller':'buyer', isMine:Number(x.seller_account_id)===accountId
      })),
      bids: bids.map(x => ({
        id:Number(x.id), side:'bid', instrument:'badge', status:activityStatus(x.status), rawStatus:x.status,
        price:Number(x.bid_price), bidPrice:Number(x.bid_price), createdAt:x.created_at, filledAt:x.filled_at, cancelledAt:x.cancelled_at,
        platformFee:Number(x.platform_fee_stonk||0), role:Number(x.buyer_account_id)===accountId?'buyer':'seller', isMine:Number(x.buyer_account_id)===accountId
      }))
    });
  } catch (err) { sendError(res, err); }
});
router.post('/listings', requireAuth, (req, res) => {
  try { const result=market.createListing(db, { accountId:req.account.id, askPrice:req.body?.askPrice }); res.json({ ok:true, ...result, reservation:market.holdingForJson(result.reservation) }); }
  catch (err) { sendError(res, err); }
});
router.patch('/listings/:id', requireAuth, (req, res) => {
  try {
    market.ensureSchema(db);
    const listing = db.prepare('SELECT * FROM badge_listings WHERE id=?').get(Number(req.params.id));
    if (!listing || Number(listing.seller_account_id)!==req.account.id) return res.status(404).json({ error:'Badge listing not found' });
    if (listing.status!=='active') return res.status(400).json({ error:'Only active Badge listings can be repriced' });
    const askPrice = positivePrice(req.body?.askPrice ?? req.body?.price, 'askPrice');
    db.prepare('UPDATE badge_listings SET ask_price=? WHERE id=?').run(askPrice, listing.id);
    res.json({ ok:true, id:Number(listing.id), askPrice });
  } catch (err) { sendError(res, err); }
});
router.delete('/listings/:id', requireAuth, (req, res) => {
  try { const result=market.cancelListing(db, { accountId:req.account.id, listingId:Number(req.params.id) }); res.json({ ...result, reservation:market.holdingForJson(result.reservation) }); }
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
router.patch('/bids/:id', requireAuth, (req, res) => {
  try {
    market.ensureSchema(db);
    const bid = db.prepare('SELECT * FROM badge_bids WHERE id=?').get(Number(req.params.id));
    if (!bid || Number(bid.buyer_account_id)!==req.account.id) return res.status(404).json({ error:'Badge bid not found' });
    if (bid.status!=='active') return res.status(400).json({ error:'Only active Badge bids can be repriced' });
    const bidPrice = positivePrice(req.body?.bidPrice ?? req.body?.price, 'bidPrice');
    const oldPrice = Number(bid.bid_price), delta = bidPrice-oldPrice;
    if (delta>0 && custodian.getBalance(req.account.id)<delta) return res.status(400).json({ error:'Not enough STONK to raise this Badge bid' });
    db.exec('BEGIN IMMEDIATE');
    try {
      if (delta>0) custodian.debit(req.account.id, delta, 'badge_bid_hold_increase', { referenceType:'badge_bid', referenceId:Number(bid.id) });
      else if (delta<0) custodian.credit(req.account.id, Math.abs(delta), 'badge_bid_hold_release', { referenceType:'badge_bid', referenceId:Number(bid.id) });
      db.prepare('UPDATE badge_bids SET bid_price=? WHERE id=?').run(bidPrice, bid.id);
      db.exec('COMMIT');
    } catch (err) { try { db.exec('ROLLBACK'); } catch (_) {} throw err; }
    res.json({ ok:true, id:Number(bid.id), bidPrice, holdDelta:delta });
  } catch (err) { sendError(res, err); }
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
