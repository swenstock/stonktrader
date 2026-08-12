const express = require("express");
const router = express.Router();
const db = require("../db");
const { getQuotes } = require("../dataProvider");

router.get("/", (req, res) => {
  const accounts = db
    .prepare(
      `SELECT accounts.id as account_id, accounts.cash_balance, accounts.starting_balance, users.display_name
       FROM accounts JOIN users ON users.id = accounts.user_id`
    )
    .all();

  const allPositions = db.prepare("SELECT * FROM positions WHERE quantity > 0").all();
  const symbolSet = new Set(allPositions.map((p) => p.symbol));
  const quotes = symbolSet.size ? getQuotes([...symbolSet]) : [];
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

  const positionsByAccount = {};
  for (const p of allPositions) {
    (positionsByAccount[p.account_id] ||= []).push(p);
  }

  const ranked = accounts
    .map((a) => {
      const positions = positionsByAccount[a.account_id] || [];
      const marketValue = positions.reduce(
        (sum, p) => sum + (priceMap[p.symbol] ?? p.avg_cost) * p.quantity,
        0
      );
      const totalValue = a.cash_balance + marketValue;
      return {
        displayName: a.display_name,
        totalValue: Number(totalValue.toFixed(2)),
        pl: Number((totalValue - a.starting_balance).toFixed(2)),
      };
    })
    .sort((a, b) => b.pl - a.pl)
    .map((row, i) => ({ rank: i + 1, ...row }));

  res.json(ranked.slice(0, 100));
});

module.exports = router;
