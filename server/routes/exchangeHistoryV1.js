'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const badgeMarket = require('../badgeMarketV45');
const { queryHistory } = require('../exchangeHistoryV1');

badgeMarket.ensureSchema(db);

router.get('/', (req, res) => {
  try {
    const result = queryHistory(db, {
      limit:req.query.limit,
      offset:req.query.offset,
      search:req.query.search,
      market:req.query.market,
    });
    res.json(result);
  } catch (err) {
    if (err?.code === 'BAD_PAGINATION' || err?.code === 'BAD_MARKET') {
      return res.status(400).json({ error:err.message });
    }
    console.error('Exchange history request failed', err);
    res.status(500).json({ error:'Exchange history request failed' });
  }
});

module.exports = router;
