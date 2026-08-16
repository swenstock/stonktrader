const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const custodian = require('../custodian');
const { TEST_MODE } = require('../testClock');
const { computePaidContest, computeFreerollRequirement } = require('../payoutEngineV2');
const { issueTicket } = require('../ticketServiceV45');

const TEST_TICKET_BACKING = Object.freeze({
  runner: 100,
  clerk: 200,
  trader: 400,
  junior: 1050,
  main_event: 3000,
});

router.use((req, res, next) => {
  if (!TEST_MODE) return res.status(404).json({ error: 'Not found' });
  next();
});

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
    return res.json({ type: 'freeroll', ...computeFreerollRequirement({ fieldSize }) });
  }
  try {
    res.json({ type: 'paid', ...computePaidContest({ tierKey: tier, fieldSize }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
