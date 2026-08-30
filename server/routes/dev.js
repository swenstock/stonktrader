const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const custodian = require('../custodian');
const db = require('../db');
const { hashPassword } = require('../auth');
const { TEST_MODE } = require('../testClock');
const { computePaidContest, computeFreerollPlan } = require('../payoutEngineV2');
const { issueTicket } = require('../ticketServiceV45');
const badgeMarket = require('../badgeMarketV45');

const TEST_TICKET_BACKING = Object.freeze({
  runner: 100,
  clerk: 200,
  trader: 400,
  junior: 1050,
});
const QA_BOOK_EMAIL = 'qa-market-maker@sbc.test';
const QA_BOOK_DISPLAY = 'QA Market Maker';
const QA_BOOK_REFERRAL = 'QAMKT1';
const QA_BOOK_DEPTH = 8;
const QA_BADGE_BIDS = [47750, 47250, 46750, 46250, 45750, 45250, 44750, 44250];
const QA_BADGE_ASKS = [48250, 48750, 49250, 49750, 50250, 50750, 51250, 51750];

router.use((req, res, next) => {
  if (!TEST_MODE) return res.status(404).json({ error: 'Not found' });
  next();
});

function ensureQaMarketMaker() {
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(QA_BOOK_EMAIL);
  if (!user) {
    const info = db.prepare('INSERT INTO users (email, password_hash, display_name, referral_code, referred_by_user_id) VALUES (?, ?, ?, ?, NULL)')
      .run(QA_BOOK_EMAIL, hashPassword('QaMarketMaker!2026'), QA_BOOK_DISPLAY, QA_BOOK_REFERRAL);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  let account = db.prepare('SELECT * FROM accounts WHERE user_id = ?').get(user.id);
  if (!account) {
    const info = db.prepare('INSERT INTO accounts (user_id, stonk_balance) VALUES (?, 0)').run(user.id);
    account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid);
  }
  return account;
}

function qaPrices(ticketType) {
  const base = TEST_TICKET_BACKING[ticketType];
  const bidMult = [0.68, 0.73, 0.78, 0.83, 0.88, 0.92, 0.95, 0.98];
  const askMult = [1.02, 1.05, 1.08, 1.12, 1.16, 1.21, 1.27, 1.34];
  return {
    bids: bidMult.map(x => Math.max(1, Math.round(base * x))),
    asks: askMult.map(x => Math.max(1, Math.round(base * x))),
  };
}

function clearQaTicketBook(accountId) {
  const now = new Date().toISOString();
  const bids = db.prepare("SELECT id,bid_price FROM ticket_bids WHERE buyer_account_id=? AND status='active'").all(accountId);
  for (const bid of bids) {
    db.prepare("UPDATE ticket_bids SET status='cancelled', cancelled_at=? WHERE id=?").run(now, bid.id);
    custodian.credit(accountId, Number(bid.bid_price), 'ticket_bid_release', { referenceType:'ticket_bid', referenceId:Number(bid.id) });
  }
  const offers = db.prepare("SELECT l.id,l.ticket_id FROM ticket_listings l WHERE l.seller_account_id=? AND l.status='active'").all(accountId);
  for (const offer of offers) {
    db.prepare("UPDATE ticket_listings SET status='cancelled', cancelled_at=? WHERE id=?").run(now, offer.id);
    db.prepare("UPDATE tickets SET status='unredeemed' WHERE id=? AND status='listed'").run(offer.ticket_id);
  }
}

function seedQaBookForType(accountId, ticketType) {
  const prices = qaPrices(ticketType);
  for (let i = 0; i < QA_BOOK_DEPTH; i++) {
    const ticket = issueTicket({ accountId, ticketType, backingStonk: TEST_TICKET_BACKING[ticketType], sourceSatelliteId: null, fundMainEventReserve: false });
    const askPrice = prices.asks[i];
    db.prepare("UPDATE tickets SET status='listed' WHERE id=?").run(ticket.id);
    db.prepare('INSERT INTO ticket_listings (ticket_id, seller_account_id, ask_price) VALUES (?, ?, ?)').run(ticket.id, accountId, askPrice);
  }

  const required = prices.bids.reduce((sum, n) => sum + n, 0);
  const balance = custodian.getBalance(accountId);
  if (required > balance) custodian.credit(accountId, required - balance + 10000, 'test_mode_market_maker_fund', { referenceType: 'test_mode', referenceId: null });
  for (const bidPrice of prices.bids) {
    const info = db.prepare('INSERT INTO ticket_bids (buyer_account_id, ticket_type, bid_price) VALUES (?, ?, ?)').run(accountId, ticketType, bidPrice);
    custodian.debit(accountId, bidPrice, 'ticket_bid_hold', { referenceType: 'ticket_bid', referenceId: info.lastInsertRowid });
  }

  return { ticketType, activeOffers: QA_BOOK_DEPTH, activeBids: QA_BOOK_DEPTH, highestBid: Math.max(...prices.bids), lowestAsk: Math.min(...prices.asks) };
}

function clearQaBadgeBook(accountId) {
  badgeMarket.ensureSchema(db);
  const listings = db.prepare("SELECT id FROM badge_listings WHERE seller_account_id=? AND status='active'").all(accountId);
  for (const row of listings) badgeMarket.cancelListing(db, { accountId, listingId:Number(row.id) });
  const bids = db.prepare("SELECT id FROM badge_bids WHERE buyer_account_id=? AND status='active'").all(accountId);
  for (const row of bids) badgeMarket.cancelBid(db, custodian, { accountId, bidId:Number(row.id) });
}

function seedQaBadgeBook(accountId) {
  clearQaBadgeBook(accountId);
  let holding = badgeMarket.getHolding(db, accountId);
  let available = Number(holding.quantity - holding.quantity_listed);
  for (let i = 0; i < QA_BOOK_DEPTH; i++) {
    if (available < 1) {
      if (custodian.getBalance(accountId) < badgeMarket.MINT_PRICE_STONK) {
        custodian.credit(accountId, badgeMarket.MINT_PRICE_STONK + 10000, 'test_mode_market_maker_fund', { referenceType:'test_mode', referenceId:null });
      }
      badgeMarket.mintBadge(db, custodian, { accountId, issuanceId:`qa-badge:${accountId}:${Date.now()}:${i}` });
      available += 1;
    }
    badgeMarket.createListing(db, { accountId, askPrice:QA_BADGE_ASKS[i] });
    available -= 1;
  }
  const bidRequired = QA_BADGE_BIDS.reduce((sum,n)=>sum+n,0);
  if (custodian.getBalance(accountId) < bidRequired) {
    custodian.credit(accountId, bidRequired - custodian.getBalance(accountId) + 10000, 'test_mode_market_maker_fund', { referenceType:'test_mode', referenceId:null });
  }
  for (const bidPrice of QA_BADGE_BIDS) badgeMarket.createBid(db, custodian, { accountId, bidPrice });
  const book = badgeMarket.book(db, null);
  return { assetType:'junior_broker_share', activeOffers:book.listings.length, activeBids:book.bids.length, highestBid:book.highestBid, lowestAsk:book.lowestAsk };
}

router.post('/fund', requireAuth, (req, res) => {
  const amount = Math.round(Number(req.body?.amount || 10000));
  if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
    return res.status(400).json({ error: 'Test funding amount must be 1 to 1,000,000 STONK' });
  }
  const balance = custodian.credit(req.account.id, amount, 'test_mode_faucet', {
    referenceType: 'test_mode', referenceId: null,
  });
  res.json({ ok: true, credited: amount, balance, testMode: true });
});

// Rebuild deterministic TEST_MODE counterparty depth. This intentionally clears
// prior QA-maker working orders so stale prices can never masquerade as another tier.
router.post('/order-book', requireAuth, (req, res) => {
  const maker = ensureQaMarketMaker();
  clearQaTicketBook(maker.id);
  const books = ['runner','clerk','trader','junior'].map(type => seedQaBookForType(maker.id, type));
  const badge = seedQaBadgeBook(maker.id);
  res.json({ ok: true, testMode: true, makerAccountId: maker.id, depthPerSide: QA_BOOK_DEPTH, books, badge });
});

// Mint TEST inventory so bids/offers/transfer UI can be exercised before the
// V45 contest resolver is enabled. Does NOT add to Main Event Reserve.
router.post('/tickets', requireAuth, (req, res) => {
  const ticketType = String(req.body?.ticketType || '').toLowerCase();
  const quantity = Math.max(1, Math.min(20, Math.round(Number(req.body?.quantity || 1))));
  const backing = TEST_TICKET_BACKING[ticketType];
  if (!backing) return res.status(400).json({ error: 'Unknown test ticket type' });
  const tickets = [];
  for (let i = 0; i < quantity; i++) {
    tickets.push(issueTicket({
      accountId: req.account.id,
      ticketType,
      backingStonk: backing,
      sourceSatelliteId: null,
      fundMainEventReserve: false,
    }));
  }
  res.json({ ok: true, testMode: true, ticketType, quantity, tickets });
});

router.get('/payout-preview', (req, res) => {
  const tier = String(req.query.tier || 'trader').toLowerCase();
  const fieldSize = Math.max(1, Math.min(100000, Math.round(Number(req.query.field || 100))));
  if (tier === 'free' || tier === 'freeroll') {
    const reserveBalance = Math.max(0, Number(req.query.reserve || 0));
    return res.json({ type: 'freeroll', ...computeFreerollPlan({ fieldSize, reserveBalance }) });
  }
  try {
    res.json({ type: 'paid', ...computePaidContest({ tierKey: tier, fieldSize }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
