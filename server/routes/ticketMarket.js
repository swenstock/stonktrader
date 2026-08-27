const express = require('express');
const router = express.Router();
const db = require('../db');
const custodian = require('../custodian');
const requireAuth = require('../middleware/requireAuth');
const { EXCHANGE_FEE_PCT } = require('../economicsPolicyV45');

const TICKET_TYPES = new Set(['runner','clerk','trader','junior']);

function optionalAccountId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const { verify } = require('../auth');
  const payload = verify(header.slice(7));
  if (!payload) return null;
  return db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(payload.userId)?.id || null;
}

function normalizeType(value) {
  const type = String(value || '').toLowerCase();
  return TICKET_TYPES.has(type) ? type : null;
}

function feeFor(price) {
  return Math.round(Number(price) * EXCHANGE_FEE_PCT);
}

function recordPlatformFee(amount, referenceType, referenceId) {
  if (!(amount > 0)) return;
  db.prepare(`INSERT INTO sbc_reserve_ledger
    (bucket, amount, reason, reference_type, reference_id)
    VALUES ('platform_revenue', ?, 'ticket_market_fee', ?, ?)`)
    .run(amount, referenceType, referenceId);
}

function serializeOffer(l) {
  return {
    id: l.id,
    side: 'offer',
    ticketId: l.ticket_id,
    ticketType: l.ticket_type,
    price: l.ask_price,
    askPrice: l.ask_price,
    status: l.status,
    sellerDisplayName: l.seller_display_name,
    isMine: l.is_mine === 1,
    createdAt: l.created_at,
    soldAt: l.sold_at,
  };
}

function serializeBid(b) {
  return {
    id: b.id,
    side: 'bid',
    ticketType: b.ticket_type,
    price: b.bid_price,
    bidPrice: b.bid_price,
    status: b.status,
    buyerDisplayName: b.buyer_display_name,
    isMine: b.is_mine === 1,
    createdAt: b.created_at,
    filledAt: b.filled_at,
  };
}

function activeOffers(ticketType, myAccountId) {
  return db.prepare(`
    SELECT ticket_listings.*, tickets.ticket_type,
      users.display_name AS seller_display_name,
      CASE WHEN ticket_listings.seller_account_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM ticket_listings
    JOIN tickets ON tickets.id = ticket_listings.ticket_id
    JOIN accounts ON accounts.id = ticket_listings.seller_account_id
    JOIN users ON users.id = accounts.user_id
    WHERE ticket_listings.status = 'active' AND tickets.ticket_type = ?
    ORDER BY ticket_listings.ask_price ASC, ticket_listings.id ASC
  `).all(myAccountId, ticketType);
}

function activeBids(ticketType, myAccountId) {
  return db.prepare(`
    SELECT ticket_bids.*, users.display_name AS buyer_display_name,
      CASE WHEN ticket_bids.buyer_account_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM ticket_bids
    JOIN accounts ON accounts.id = ticket_bids.buyer_account_id
    JOIN users ON users.id = accounts.user_id
    WHERE ticket_bids.status = 'active' AND ticket_bids.ticket_type = ?
    ORDER BY ticket_bids.bid_price DESC, ticket_bids.id ASC
  `).all(myAccountId, ticketType);
}

// Backward-compatible legacy endpoint: active OFFERS only.
router.get('/', (req, res) => {
  const myAccountId = optionalAccountId(req);
  const rows = db.prepare(`
    SELECT ticket_listings.*, tickets.ticket_type,
      users.display_name AS seller_display_name,
      CASE WHEN ticket_listings.seller_account_id = ? THEN 1 ELSE 0 END AS is_mine
    FROM ticket_listings
    JOIN tickets ON tickets.id = ticket_listings.ticket_id
    JOIN accounts ON accounts.id = ticket_listings.seller_account_id
    JOIN users ON users.id = accounts.user_id
    WHERE ticket_listings.status = 'active'
    ORDER BY ticket_listings.ask_price ASC
  `).all(myAccountId);
  res.json(rows.map(serializeOffer));
});

// V45 order book: BIDS left, OFFERS right.
router.get('/book/:ticketType', (req, res) => {
  const ticketType = normalizeType(req.params.ticketType);
  if (!ticketType) return res.status(400).json({ error: 'Unknown ticket type' });
  const myAccountId = optionalAccountId(req);
  const bids = activeBids(ticketType, myAccountId).map(serializeBid);
  const offers = activeOffers(ticketType, myAccountId).map(serializeOffer);
  res.json({
    ticketType,
    highestBid: bids[0]?.bidPrice ?? null,
    lowestAsk: offers[0]?.askPrice ?? null,
    bids,
    offers,
    exchangeFeePct: EXCHANGE_FEE_PCT,
  });
});

router.get('/mine', requireAuth, (req, res) => {
  const offers = db.prepare(`
    SELECT ticket_listings.*, tickets.ticket_type, users.display_name AS seller_display_name, 1 AS is_mine
    FROM ticket_listings
    JOIN tickets ON tickets.id = ticket_listings.ticket_id
    JOIN accounts ON accounts.id = ticket_listings.seller_account_id
    JOIN users ON users.id = accounts.user_id
    WHERE seller_account_id = ? ORDER BY ticket_listings.id DESC LIMIT 50
  `).all(req.account.id).map(serializeOffer);
  const bids = db.prepare(`
    SELECT ticket_bids.*, users.display_name AS buyer_display_name, 1 AS is_mine
    FROM ticket_bids
    JOIN accounts ON accounts.id = ticket_bids.buyer_account_id
    JOIN users ON users.id = accounts.user_id
    WHERE buyer_account_id = ? ORDER BY ticket_bids.id DESC LIMIT 50
  `).all(req.account.id).map(serializeBid);
  res.json({ bids, offers });
});

function createOffer(req, res) {
  const { ticketId, askPrice } = req.body || {};
  const price = Math.round(Number(askPrice));
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'askPrice must be a positive number' });
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket || ticket.account_id !== req.account.id) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.status !== 'unredeemed') return res.status(400).json({ error: 'Only unredeemed tickets can be offered' });

  try {
    db.exec('BEGIN');
    db.prepare("UPDATE tickets SET status = 'listed' WHERE id = ?").run(ticketId);
    const info = db.prepare('INSERT INTO ticket_listings (ticket_id, seller_account_id, ask_price) VALUES (?, ?, ?)')
      .run(ticketId, req.account.id, price);
    db.exec('COMMIT');
    res.json({ ok: true, id: info.lastInsertRowid, ticketType: ticket.ticket_type, askPrice: price });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

router.post('/', requireAuth, createOffer); // legacy
router.post('/offers', requireAuth, createOffer); // V45

// Seller reprices an active offer. The ticket remains locked/listed.
router.patch('/offers/:id', requireAuth, (req, res) => {
  const listing = db.prepare(`
    SELECT ticket_listings.*, tickets.ticket_type
    FROM ticket_listings JOIN tickets ON tickets.id = ticket_listings.ticket_id
    WHERE ticket_listings.id = ?
  `).get(req.params.id);
  if (!listing || listing.seller_account_id !== req.account.id) return res.status(404).json({ error: 'Offer not found' });
  if (listing.status !== 'active') return res.status(400).json({ error: 'Only active offers can be repriced' });
  const price = Math.round(Number(req.body?.askPrice ?? req.body?.price));
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'askPrice must be a positive number' });
  db.prepare('UPDATE ticket_listings SET ask_price = ? WHERE id = ?').run(price, listing.id);
  res.json({ ok: true, id: listing.id, ticketType: listing.ticket_type, askPrice: price });
});

function buyOffer(req, res) {
  const listing = db.prepare('SELECT * FROM ticket_listings WHERE id = ?').get(req.params.id);
  if (!listing || listing.status !== 'active') return res.status(404).json({ error: 'Offer not available' });
  if (listing.seller_account_id === req.account.id) return res.status(400).json({ error: "You can't buy your own offer" });
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(listing.ticket_id);
  if (!ticket || ticket.status !== 'listed') return res.status(400).json({ error: 'This ticket is no longer available' });
  if (custodian.getBalance(req.account.id) < listing.ask_price) return res.status(400).json({ error: 'Not enough STONK' });

  const fee = feeFor(listing.ask_price);
  const sellerProceeds = listing.ask_price - fee;
  try {
    db.exec('BEGIN');
    custodian.debit(req.account.id, listing.ask_price, 'ticket_purchase', { referenceType: 'ticket', referenceId: ticket.id });
    custodian.credit(listing.seller_account_id, sellerProceeds, 'ticket_sale', { referenceType: 'ticket', referenceId: ticket.id });
    recordPlatformFee(fee, 'ticket_listing', listing.id);
    db.prepare("UPDATE tickets SET account_id = ?, status = 'unredeemed' WHERE id = ?").run(req.account.id, ticket.id);
    db.prepare("UPDATE ticket_listings SET status='sold', buyer_account_id=?, platform_fee_stonk=?, sold_at=? WHERE id=?")
      .run(req.account.id, fee, new Date().toISOString(), listing.id);
    db.exec('COMMIT');
    res.json({ ok: true, ticketId: ticket.id, ticketType: ticket.ticket_type, paid: listing.ask_price, sellerReceived: sellerProceeds, platformFee: fee });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

router.post('/:id/buy', requireAuth, buyOffer); // legacy
router.post('/offers/:id/buy', requireAuth, buyOffer); // V45

function cancelOffer(req, res) {
  const listing = db.prepare('SELECT * FROM ticket_listings WHERE id = ?').get(req.params.id);
  if (!listing || listing.seller_account_id !== req.account.id) return res.status(404).json({ error: 'Offer not found' });
  if (listing.status !== 'active') return res.status(400).json({ error: 'Only active offers can be cancelled' });
  try {
    db.exec('BEGIN');
    db.prepare("UPDATE tickets SET status='unredeemed' WHERE id=?").run(listing.ticket_id);
    db.prepare("UPDATE ticket_listings SET status='cancelled' WHERE id=?").run(listing.id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}
router.delete('/:id', requireAuth, cancelOffer); // legacy
router.delete('/offers/:id', requireAuth, cancelOffer); // V45

// Place one independent BID for one ticket. The full bid amount is held now.
router.post('/bids', requireAuth, (req, res) => {
  const ticketType = normalizeType(req.body?.ticketType);
  const price = Math.round(Number(req.body?.bidPrice));
  if (!ticketType) return res.status(400).json({ error: 'Unknown ticket type' });
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'bidPrice must be a positive number' });
  if (custodian.getBalance(req.account.id) < price) return res.status(400).json({ error: 'Not enough STONK to fund this bid' });

  try {
    db.exec('BEGIN');
    const info = db.prepare('INSERT INTO ticket_bids (buyer_account_id, ticket_type, bid_price) VALUES (?, ?, ?)')
      .run(req.account.id, ticketType, price);
    custodian.debit(req.account.id, price, 'ticket_bid_hold', { referenceType: 'ticket_bid', referenceId: info.lastInsertRowid });
    db.exec('COMMIT');
    res.json({ ok: true, id: info.lastInsertRowid, ticketType, bidPrice: price });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
});

// Buyer reprices an active bid. Adjust the held STONK by only the difference.
router.patch('/bids/:id', requireAuth, (req, res) => {
  const bid = db.prepare('SELECT * FROM ticket_bids WHERE id = ?').get(req.params.id);
  if (!bid || bid.buyer_account_id !== req.account.id) return res.status(404).json({ error: 'Bid not found' });
  if (bid.status !== 'active') return res.status(400).json({ error: 'Only active bids can be repriced' });
  const price = Math.round(Number(req.body?.bidPrice ?? req.body?.price));
  if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ error: 'bidPrice must be a positive number' });
  const oldPrice = Number(bid.bid_price);
  const delta = price - oldPrice;
  if (delta > 0 && custodian.getBalance(req.account.id) < delta) return res.status(400).json({ error: 'Not enough STONK to raise this bid' });

  try {
    db.exec('BEGIN');
    if (delta > 0) {
      custodian.debit(req.account.id, delta, 'ticket_bid_hold_increase', { referenceType: 'ticket_bid', referenceId: bid.id });
    } else if (delta < 0) {
      custodian.credit(req.account.id, Math.abs(delta), 'ticket_bid_hold_release', { referenceType: 'ticket_bid', referenceId: bid.id });
    }
    db.prepare('UPDATE ticket_bids SET bid_price = ? WHERE id = ?').run(price, bid.id);
    db.exec('COMMIT');
    res.json({ ok: true, id: bid.id, ticketType: bid.ticket_type, bidPrice: price, holdDelta: delta });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
});

// Buyer cancels an active bid; held funds return in full.
router.delete('/bids/:id', requireAuth, (req, res) => {
  const bid = db.prepare('SELECT * FROM ticket_bids WHERE id = ?').get(req.params.id);
  if (!bid || bid.buyer_account_id !== req.account.id) return res.status(404).json({ error: 'Bid not found' });
  if (bid.status !== 'active') return res.status(400).json({ error: 'Only active bids can be cancelled' });
  try {
    db.exec('BEGIN');
    db.prepare("UPDATE ticket_bids SET status='cancelled', cancelled_at=? WHERE id=?").run(new Date().toISOString(), bid.id);
    custodian.credit(req.account.id, bid.bid_price, 'ticket_bid_release', { referenceType: 'ticket_bid', referenceId: bid.id });
    db.exec('COMMIT');
    res.json({ ok: true, released: bid.bid_price });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
});

// Ticket owner accepts an independent buyer bid: SELL TO BID.
router.post('/bids/:id/sell', requireAuth, (req, res) => {
  const bid = db.prepare('SELECT * FROM ticket_bids WHERE id = ?').get(req.params.id);
  if (!bid || bid.status !== 'active') return res.status(404).json({ error: 'Bid not available' });
  if (bid.buyer_account_id === req.account.id) return res.status(400).json({ error: "You can't sell a ticket to your own bid" });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.body?.ticketId);
  if (!ticket || ticket.account_id !== req.account.id) return res.status(404).json({ error: 'Ticket not found' });
  if (!['unredeemed','listed'].includes(ticket.status)) return res.status(400).json({ error: 'Ticket is not transferable' });
  if (ticket.ticket_type !== bid.ticket_type) return res.status(400).json({ error: `This bid is for a ${bid.ticket_type} ticket` });

  const fee = feeFor(bid.bid_price);
  const sellerProceeds = bid.bid_price - fee;
  try {
    db.exec('BEGIN');
    // If this ticket was also offered, remove that offer atomically first.
    if (ticket.status === 'listed') {
      db.prepare("UPDATE ticket_listings SET status='cancelled' WHERE ticket_id=? AND status='active'").run(ticket.id);
    }
    custodian.credit(req.account.id, sellerProceeds, 'ticket_sale_to_bid', { referenceType: 'ticket', referenceId: ticket.id });
    recordPlatformFee(fee, 'ticket_bid', bid.id);
    db.prepare("UPDATE tickets SET account_id=?, status='unredeemed' WHERE id=?").run(bid.buyer_account_id, ticket.id);
    db.prepare("UPDATE ticket_bids SET status='filled', filled_ticket_id=?, seller_account_id=?, platform_fee_stonk=?, filled_at=? WHERE id=?")
      .run(ticket.id, req.account.id, fee, new Date().toISOString(), bid.id);
    db.exec('COMMIT');
    res.json({ ok: true, ticketId: ticket.id, ticketType: ticket.ticket_type, soldFor: bid.bid_price, sellerReceived: sellerProceeds, platformFee: fee });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
});

module.exports = router;
