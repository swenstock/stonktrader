const express = require('express');
const router = express.Router();
const testClock = require('../testClock');
const dataProvider = require('../dataProvider');
const { getSimulatedQuote, getSimulatedBars } = require('../simulatedQuoteEngine');

function metaFor(symbol) {
  const raw = dataProvider.SYMBOLS?.[String(symbol || '').toUpperCase()];
  if (!raw) return null;
  return { ...raw, symbol: String(symbol).toUpperCase() };
}

// GET /api/sim-market/status
router.get('/status', (req, res) => {
  res.json({
    source: 'sim',
    deterministic: true,
    now: testClock.getNow().toISOString(),
    testClock: testClock.getStatus(),
  });
});

// GET /api/sim-market/quotes?symbols=AAPL,MSFT,NVDA
router.get('/quotes', (req, res) => {
  const symbols = String(req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: 'symbols query param required' });
  const now = testClock.getNow();
  const quotes = symbols.map(metaFor).filter(Boolean).map(meta => getSimulatedQuote(meta, now));
  res.json(quotes);
});

// GET /api/sim-market/bars/NVDA?interval=5m&minutes=120
router.get('/bars/:symbol', (req, res) => {
  const meta = metaFor(req.params.symbol);
  if (!meta) return res.status(404).json({ error: 'unknown symbol' });
  const interval = String(req.query.interval || '5m');
  const minutes = Math.max(5, Math.min(60 * 24 * 10, Number(req.query.minutes) || 120));
  const to = testClock.getNow();
  const from = new Date(to.getTime() - minutes * 60_000);
  res.json({
    symbol: meta.symbol,
    interval,
    from: from.toISOString(),
    to: to.toISOString(),
    source: 'sim',
    bars: getSimulatedBars(meta, interval, from, to),
  });
});

module.exports = router;
