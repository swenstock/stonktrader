const db = require("./db");
const { getQuotes } = require("./dataProvider");

// Computes total portfolio value (cash + market value of positions) for one
// or many accounts at once. Shared by portfolio.js, leaderboard.js, and
// contests.js so "what is this account worth right now" is defined in
// exactly one place.

function totalValueForAccounts(accountIds) {
  if (!accountIds.length) return {};
  const placeholders = accountIds.map(() => "?").join(",");
  const positions = db
    .prepare(
      `SELECT * FROM positions WHERE quantity > 0 AND account_id IN (${placeholders})`
    )
    .all(...accountIds);

  const symbolSet = new Set(positions.map((p) => p.symbol));
  const quotes = symbolSet.size ? getQuotes([...symbolSet]) : [];
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

  const marketValueByAccount = {};
  for (const p of positions) {
    const value = (priceMap[p.symbol] ?? p.avg_cost) * p.quantity;
    marketValueByAccount[p.account_id] = (marketValueByAccount[p.account_id] || 0) + value;
  }

  const accountsPlaceholders = accountIds.map(() => "?").join(",");
  const accounts = db
    .prepare(`SELECT id, cash_balance FROM accounts WHERE id IN (${accountsPlaceholders})`)
    .all(...accountIds);

  const result = {};
  for (const a of accounts) {
    result[a.id] = a.cash_balance + (marketValueByAccount[a.id] || 0);
  }
  return result;
}

function totalValueForAccount(accountId) {
  return totalValueForAccounts([accountId])[accountId] ?? 0;
}

module.exports = { totalValueForAccounts, totalValueForAccount };
