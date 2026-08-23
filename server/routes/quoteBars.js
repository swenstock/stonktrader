// ADDITIVE ONLY - wraps the existing simulatedQuoteEngine.getSimulatedBars()
// with an HTTP endpoint for the standalone Stage94 advanced chart.

const express = require("express");
const router = express.Router();
const { SYMBOLS } = require("../dataProvider");
const { getSimulatedBars } = require("../simulatedQuoteEngine");

const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "1D"];
const BAR_COUNT_BY_INTERVAL = { "1m": 240, "5m": 288, "15m": 384, "1h": 336, "1D": 260 };

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
  const stepMs = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000, "1D": 86400000 }[interval];
  const to = new Date();
  const from = new Date(to.getTime() - count * stepMs);

  const bars = getSimulatedBars({ ...meta, symbol }, interval, from, to);
  res.json({ symbol, interval, bars });
});

module.exports = router;
