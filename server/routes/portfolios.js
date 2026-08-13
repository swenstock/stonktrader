const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { getQuote, getQuotes, MIN_MARKET_CAP } = require("../dataProvider");
const { totalValueForPortfolio } = require("../portfolioValue");

const MAX_INITIAL_POSITION_PCT = 0.10; // 10% of portfolio value, checked at time of BUY only — raised from 5%, since a 15-symbol universe at 5% caps total possible deployment at 75%

// Finds which contest or satellite a portfolio belongs to, for display
// context ("Morning Session — Aug 12", still open vs resolved, etc).
function contextFor(portfolioId) {
  const ce = db
    .prepare(
      `SELECT contest_entries.*, contests.week_start, contests.week_end, contests.status as contest_status
       FROM contest_entries JOIN contests ON contests.id = contest_entries.contest_id
       WHERE portfolio_id = ?`
    )
    .get(portfolioId);
  if (ce) {
    return {
      type: "contest",
      sourceId: ce.contest_id,
      status: ce.contest_status,
      endsAt: ce.week_end,
    };
  }
  const se = db
    .prepare(
      `SELECT satellite_entries.*, satellites.locks_at, satellites.status as satellite_status, satellites.name
       FROM satellite_entries JOIN satellites ON satellites.id = satellite_entries.satellite_id
       WHERE portfolio_id = ?`
    )
    .get(portfolioId);
  if (se) {
    return {
      type: "satellite",
      sourceId: se.satellite_id,
      status: se.satellite_status,
      endsAt: se.locks_at,
    };
  }
  return { type: "unknown", sourceId: null, status: "unknown", endsAt: null };
}

function summarize(portfolio) {
  const positions = db
    .prepare("SELECT * FROM positions WHERE portfolio_id = ? AND quantity > 0")
    .all(portfolio.id);
  const symbols = positions.map((p) => p.symbol);
  const quotes = symbols.length ? getQuotes(symbols) : [];
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
  let marketValue = 0;
  for (const p of positions) marketValue += (priceMap[p.symbol] ?? p.avg_cost) * p.quantity;
  const totalValue = portfolio.cash_balance + marketValue;
  const context = contextFor(portfolio.id);
  return {
    id: portfolio.id,
    label: portfolio.label,
    cash: Number(portfolio.cash_balance.toFixed(2)),
    totalValue: Number(totalValue.toFixed(2)),
    pl: Number((totalValue - 100000).toFixed(2)),
    positionCount: positions.length,
    context,
  };
}

// GET /api/portfolios — all of my portfolios (one per contest/satellite entry)
router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM portfolios WHERE account_id = ? ORDER BY id DESC").all(req.account.id);
  res.json(rows.map(summarize));
});

// GET /api/portfolios/:id — full detail: positions with live prices, cash, P&L
router.get("/:id", requireAuth, (req, res) => {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) {
    return res.status(404).json({ error: "Portfolio not found" });
  }

  const positions = db
    .prepare("SELECT * FROM positions WHERE portfolio_id = ? AND quantity > 0")
    .all(portfolio.id);
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

  const totalValue = portfolio.cash_balance + marketValue;
  res.json({
    id: portfolio.id,
    label: portfolio.label,
    cash: Number(portfolio.cash_balance.toFixed(2)),
    positions: enriched,
    totalValue: Number(totalValue.toFixed(2)),
    pl: Number((totalValue - 100000).toFixed(2)),
    context: contextFor(portfolio.id),
  });
});

// POST /api/portfolios/:id/trades — buy/sell within this specific portfolio only
router.post("/:id/trades", requireAuth, (req, res) => {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) {
    return res.status(404).json({ error: "Portfolio not found" });
  }

  const { symbol, side, quantity } = req.body || {};
  if (!symbol || !["buy", "sell"].includes(side) || !quantity || quantity <= 0) {
    return res
      .status(400)
      .json({ error: "symbol, side ('buy'|'sell'), and a positive quantity are required" });
  }

  const quote = getQuote(symbol);
  if (!quote) return res.status(404).json({ error: "Unknown symbol" });

  const portfolioId = portfolio.id;
  const cost = quote.price * quantity;

  // Trading rules — sensible position sizing, not gambling. Only apply to
  // BUY orders; selling to reduce risk is never restricted.
  if (side === "buy") {
    if (quote.marketCap != null && quote.marketCap < MIN_MARKET_CAP) {
      return res.status(400).json({
        error: `${symbol} is below the minimum market cap for this platform ($${(MIN_MARKET_CAP / 1e9).toFixed(0)}B) — no micro-cap plays.`,
      });
    }

    const existingPosition = db
      .prepare("SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?")
      .get(portfolioId, symbol);
    const existingCostBasis = existingPosition ? existingPosition.avg_cost * existingPosition.quantity : 0;
    const portfolioValue = totalValueForPortfolio(portfolioId);
    const maxAllowed = portfolioValue * MAX_INITIAL_POSITION_PCT;

    if (existingCostBasis + cost > maxAllowed + 0.01) {
      const room = Math.max(0, maxAllowed - existingCostBasis);
      return res.status(400).json({
        error: `This would put more than 10% of your portfolio into ${symbol} at entry. Max additional buy right now: ~$${room.toFixed(2)}. (A position CAN grow past 10% from price gains — this limit only applies to new buys.)`,
      });
    }
  }

  try {
    db.exec("BEGIN");
    const fresh = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId);
    const position = db
      .prepare("SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?")
      .get(portfolioId, symbol);

    if (side === "buy") {
      if (cost > fresh.cash_balance + 0.01) throw new Error("INSUFFICIENT_CASH");
      db.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").run(cost, portfolioId);
      if (position) {
        const newQty = position.quantity + quantity;
        const newAvg = (position.avg_cost * position.quantity + cost) / newQty;
        db.prepare("UPDATE positions SET quantity = ?, avg_cost = ? WHERE id = ?").run(
          newQty,
          newAvg,
          position.id
        );
      } else {
        db.prepare(
          "INSERT INTO positions (portfolio_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)"
        ).run(portfolioId, symbol, quantity, quote.price);
      }
    } else {
      if (!position || position.quantity < quantity) throw new Error("INSUFFICIENT_SHARES");
      db.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?").run(cost, portfolioId);
      db.prepare("UPDATE positions SET quantity = quantity - ? WHERE id = ?").run(quantity, position.id);
    }

    db.prepare(
      "INSERT INTO trades (portfolio_id, symbol, side, quantity, price) VALUES (?, ?, ?, ?, ?)"
    ).run(portfolioId, symbol, side, quantity, quote.price);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    if (e.message === "INSUFFICIENT_CASH") return res.status(400).json({ error: "Not enough cash" });
    if (e.message === "INSUFFICIENT_SHARES")
      return res.status(400).json({ error: "You don't own enough shares to sell that many" });
    throw e;
  }

  res.json({ ok: true, symbol, side, quantity, price: quote.price });
});

router.get("/:id/trades", requireAuth, (req, res) => {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) {
    return res.status(404).json({ error: "Portfolio not found" });
  }
  const trades = db
    .prepare("SELECT symbol, side, quantity, price, timestamp FROM trades WHERE portfolio_id = ? ORDER BY timestamp DESC LIMIT 100")
    .all(portfolio.id);
  res.json(trades);
});

module.exports = router;
