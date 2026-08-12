const express = require("express");
const router = express.Router();
const db = require("../db");
const { getQuotes } = require("../dataProvider");
const requireAuth = require("../middleware/requireAuth");

router.get("/", requireAuth, (req, res) => {
  const account = req.account;
  const positions = db
    .prepare("SELECT * FROM positions WHERE account_id = ? AND quantity > 0")
    .all(account.id);

  const symbols = positions.map((p) => p.symbol);
  const quotes = symbols.length ? getQuotes(symbols) : [];
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

  let marketValue = 0;
  const enriched = positions.map((p) => {
    const price = priceMap[p.symbol] ?? p.avg_cost;
    const value = price * p.quantity;
    marketValue += value;
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: Number(p.avg_cost.toFixed(2)),
      price,
      value: Number(value.toFixed(2)),
      unrealizedPL: Number(((price - p.avg_cost) * p.quantity).toFixed(2)),
    };
  });

  const totalValue = account.cash_balance + marketValue;
  res.json({
    cash: Number(account.cash_balance.toFixed(2)),
    stonkBalance: Number(account.stonk_balance.toFixed(2)),
    positions: enriched,
    totalValue: Number(totalValue.toFixed(2)),
    totalPL: Number((totalValue - account.starting_balance).toFixed(2)),
  });
});

module.exports = router;
