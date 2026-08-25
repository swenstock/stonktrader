const express = require('express');
const router = express.Router();
const db = require('../db');
const { getBrokerRaceStats } = require('../juniorBrokerRace');

router.get('/', (req, res) => {
  try {
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isSafeInteger(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 50;
    res.json(getBrokerRaceStats(db, { limit }));
  } catch (err) {
    console.error('Broker race stats failed', err);
    res.status(500).json({ error: 'Unable to load Broker Race' });
  }
});

module.exports = router;
