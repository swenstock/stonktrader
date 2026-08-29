// ADDITIVE ONLY - wraps the existing simulatedQuoteEngine.getSimulatedBars()
// with an HTTP endpoint for the standalone Stage94 advanced chart.

const express = require("express");
const router = express.Router();
const { SYMBOLS } = require("../dataProvider");
const { getSimulatedBars } = require("../simulatedQuoteEngine");

const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "1D"];
const BAR_COUNT_BY_INTERVAL = { "1m": 240, "5m": 288, "15m": 384, "1h": 336, "1D": 260 };
const STEP_MS = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000, "1D": 86400000 };

function etSessionParts(instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(instant);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

function isRegularSessionBar(bar) {
  const d = new Date(bar.time);
  const { weekday, minutes } = etSessionParts(d);
  return weekday !== 'Sat' && weekday !== 'Sun' && minutes >= 570 && minutes < 960;
}

// GET /api/quotes/bars?symbol=AAPL&interval=5m
router.get("/", (req, res) => {
  const symbol = String(req.query.symbol || "").toUpperCase().trim();
  const interval = String(req.query.interval || "5m");

  if (!symbol) return res.status(400).json({ error: "symbol query param required" });
  const meta = SYMBOLS[symbol];
  if (!meta) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
  if (!VALID_INTERVALS.includes(interval)) {
    return res.status(400).json({ error: `interval must be one of: ${VALID_INTERVALS.join(", ")}` });
  }

  const count = BAR_COUNT_BY_INTERVAL[interval];
  const stepMs = STEP_MS[interval];
  const to = new Date();
  const lookbackMultiplier = interval === '1D' ? 1 : 5;
  const from = new Date(to.getTime() - count * stepMs * lookbackMultiplier);

  let bars = getSimulatedBars({ ...meta, symbol }, interval, from, to);
  if (interval !== '1D') bars = bars.filter(isRegularSessionBar).slice(-count);
  res.json({ symbol, interval, bars });
});

module.exports = router;
module.exports._test = { etSessionParts, isRegularSessionBar };
