const db = require("./db");
const { getQuotes } = require("./dataProvider");

// Computes total value (cash + market value of positions) for one or many
// PORTFOLIOS at once — each contest/satellite entry has its own dedicated
// portfolio, so this is the single place "what is this specific entry
// worth right now" is defined. Shared by portfolio routes, leaderboards,
// and both schedulers' resolution logic.

function totalValueForPortfolios(portfolioIds) {
  if (!portfolioIds.length) return {};
  const placeholders = portfolioIds.map(() => "?").join(",");
  const positions = db
    .prepare(`SELECT * FROM positions WHERE quantity > 0 AND portfolio_id IN (${placeholders})`)
    .all(...portfolioIds);

  const symbolSet = new Set(positions.map((p) => p.symbol));
  const quotes = symbolSet.size ? getQuotes([...symbolSet]) : [];
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));

  const marketValueByPortfolio = {};
  for (const p of positions) {
    const value = (priceMap[p.symbol] ?? p.avg_cost) * p.quantity;
    marketValueByPortfolio[p.portfolio_id] = (marketValueByPortfolio[p.portfolio_id] || 0) + value;
  }

  const portfolios = db
    .prepare(`SELECT id, cash_balance FROM portfolios WHERE id IN (${placeholders})`)
    .all(...portfolioIds);

  const result = {};
  for (const p of portfolios) {
    result[p.id] = p.cash_balance + (marketValueByPortfolio[p.id] || 0);
  }
  return result;
}

function totalValueForPortfolio(portfolioId) {
  return totalValueForPortfolios([portfolioId])[portfolioId] ?? 0;
}

// Creates a fresh $100,000 portfolio and returns its id — called whenever
// someone joins a contest or satellite.
function createPortfolio(accountId, label) {
  const info = db
    .prepare("INSERT INTO portfolios (account_id, label, cash_balance) VALUES (?, ?, 100000)")
    .run(accountId, label);
  return info.lastInsertRowid;
}

module.exports = { totalValueForPortfolios, totalValueForPortfolio, createPortfolio };
