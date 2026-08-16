const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const custodian = require('../custodian');
const { TEST_MODE } = require('../testClock');

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

module.exports = router;
