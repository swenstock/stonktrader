const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const custodian = require('../custodian');
const db = require('../db');
const { hashPassword } = require('../auth');
const { TEST_MODE } = require('../testClock');
const { computePaidContest, computeFreerollPlan } = require('../payoutEngineV2');
const { issueTicket } = require('../ticketServiceV45');

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

function seedQaBookForType(accountId, ticketType) {
  const prices = qaPrices(ticketType);
  const activeOfferCount = Number(db.prepare(`SELECT COUNT(*) AS n FROM ticket_listings l JOIN tickets t ON t.id=l.ticket_id WHERE l.seller_account_id=? AND l.status='active' AND t.ticket_type=?`).get(accountId, ticketType)?.n || 0);
  const activeBidCount = Number(db.prepare(`SELECT COUNT(*) AS n FROM ticket_bids WHERE buyer_account_id=? AND status='active' AND ticket_type=?`).get(accountId, ticketType)?.n || 0);
  const offersNeeded = Math.max(0, QA_BOOK_DEPTH - activeOfferCount);
  const bidsNeeded = Math.max(0, QA_BOOK_DEPTH - activeBidCount);

  for (let i = 0; i < offersNeeded; i++) {
    const ticket = issueTicket({ accountId, ticketType, backingStonk: TEST_TICKET_BACKING[ticketType], sourceSatelliteId: null, fundMainEventReserve: false });
    const askPrice = prices.asks[(activeOfferCount + i) % prices.asks.length];
    db.prepare("UPDATE tickets SET status='listed' WHERE id=?").run(ticket.id);
    db.prepare('INSERT INTO ticket_listings (ticket_id, seller_account_id, ask_price) VALUES (?, ?, ?)').run(ticket.id, accountId, askPrice);
  }

  const bidPrices = [];
  for (let i = 0; i < bidsNeeded; i++) bidPrices.push(prices.bids[(activeBidCount + i) % prices.bids.length]);
  const required = bidPrices.reduce((sum, n) => sum + n, 0);
  const balance = custodian.getBalance(accountId);
  if (required > balance) custodian.credit(accountId, required - balance + 10000, 'test_mode_market_maker_fund', { referenceType: 'test_mode', referenceId: null });
  for (const bidPrice of bidPrices) {
    const info = db.prepare('INSERT INTO ticket_bids (buyer_account_id, ticket_type, bid_price) VALUES (?, ?, ?)').run(accountId, ticketType, bidPrice);
    custodian.debit(accountId, bidPrice, 'ticket_bid_hold', { referenceType: 'ticket_bid', referenceId: info.lastInsertRowid });
  }

  return { ticketType, activeOffers: activeOfferCount + offersNeeded, activeBids: activeBidCount + bidsNeeded };
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

// Populate real TEST_MODE counterparty depth. Orders belong to a dedicated QA
// market-maker account, so the signed-in tester can actually trade against them.
router.post('/order-book', requireAuth, (req, res) => {
  const maker = ensureQaMarketMaker();
  const books = ['runner','clerk','trader','junior'].map(type => seedQaBookForType(maker.id, type));
  res.json({ ok: true, testMode: true, makerAccountId: maker.id, depthPerSide: QA_BOOK_DEPTH, books });
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
