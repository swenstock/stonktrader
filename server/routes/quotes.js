const express = require("express");
const router = express.Router();
const { listSymbols, getQuotes } = require("../dataProvider");

// GET /api/quotes/symbols — full tradable universe (for search/watchlist UI)
router.get("/symbols", (req, res) => {
  res.json(listSymbols());
});

// GET /api/quotes?symbols=AAPL,MSFT,HSBA.L
router.get("/", (req, res) => {
  const symbols = String(req.query.symbols || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!symbols.length) return res.status(400).json({ error: "symbols query param required" });
  res.json(getQuotes(symbols));
});

module.exports = router;
