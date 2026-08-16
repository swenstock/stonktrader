const express = require("express");
const router = express.Router();
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { getQuote, getQuotes, MIN_MARKET_CAP } = require("../dataProvider");
const { totalValueForPortfolio } = require("../portfolioValue");
const testClock = require("../testClock");
const { easternParts, isWeekday } = require("../timeHelpers");

const MAX_INITIAL_POSITION_PCT = 0.10;
const TEST_MODE = process.env.TEST_MODE === "true";
const TEST_SATELLITE_MINUTES = Number(process.env.TEST_SATELLITE_MINUTES || 20);
const TEST_MAIN_EVENT_MINUTES = Number(process.env.TEST_MAIN_EVENT_MINUTES || 10);

function satelliteForPortfolio(portfolioId) {
  return db.prepare(`SELECT satellites.* FROM satellite_entries
    JOIN satellites ON satellites.id = satellite_entries.satellite_id
    WHERE satellite_entries.portfolio_id = ?`).get(portfolioId) || null;
}

function contestForPortfolio(portfolioId) {
  return db.prepare(`SELECT contests.* FROM contest_entries
    JOIN contests ON contests.id = contest_entries.contest_id
    WHERE contest_entries.portfolio_id = ?`).get(portfolioId) || null;
}

function isDegenHoursPortfolio(portfolioId) {
  return satelliteForPortfolio(portfolioId)?.tier_id === "hourly";
}

function regularMarketOpen(now) {
  if (!isWeekday(now)) return false;
  const p = easternParts(now);
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return minutes >= 570 && minutes < 960;
}

function durationMinutes(start, end) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function isCompressedTestSatellite(satellite) {
  if (!TEST_MODE || !satellite) return false;
  return durationMinutes(satellite.opens_at, satellite.locks_at) <= TEST_SATELLITE_MINUTES + 0.25;
}

function isCompressedTestContest(contest) {
  if (!TEST_MODE || !contest) return false;
  return durationMinutes(contest.week_start, contest.week_end) <= TEST_MAIN_EVENT_MINUTES + 0.25;
}

function tradeAvailability(portfolioId) {
  const now = testClock.getNow();
  const satellite = satelliteForPortfolio(portfolioId);
  if (satellite) {
    if (satellite.status !== "open") return { allowed:false, reason:"This contest is no longer open for trading.", now };
    const opens = new Date(satellite.opens_at).getTime();
    const locks = new Date(satellite.locks_at).getTime();
    if (now.getTime() < opens || now.getTime() >= locks) return { allowed:false, reason:"This contest is outside its trading window.", now };

    // Compressed TEST_MODE rooms are synthetic QA sessions and may be created
    // on weekends/after hours. Their own open/lock bounds are authoritative.
    // Real-duration rooms — including Test Clock simulations of actual market
    // sessions — still obey normal U.S. equity market hours.
    if (!isCompressedTestSatellite(satellite) && !regularMarketOpen(now)) {
      return { allowed:false, reason:"US equity trading is closed. SBC trading resumes at the next regular-market window.", now };
    }
    return { allowed:true, now, type:"satellite", source:satellite };
  }

  const contest = contestForPortfolio(portfolioId);
  if (contest) {
    if (contest.status !== "open") return { allowed:false, reason:"The Main Event is no longer open for trading.", now };
    if (now.getTime() < new Date(contest.week_start).getTime() || now.getTime() >= new Date(contest.week_end).getTime()) {
      return { allowed:false, reason:"The Main Event is outside its active week.", now };
    }
    if (!isCompressedTestContest(contest) && !regularMarketOpen(now)) {
      return { allowed:false, reason:"US equity trading is closed. The Main Event resumes at the next regular-market open.", now };
    }
    return { allowed:true, now, type:"contest", source:contest };
  }
  return { allowed:false, reason:"This portfolio is not attached to an active SBC contest.", now };
}

function contextFor(portfolioId) {
  const contest = contestForPortfolio(portfolioId);
  if (contest) {
    return {
      type: "contest",
      sourceId: contest.id,
      status: contest.status,
      startsAt: contest.week_start,
      endsAt: contest.week_end,
    };
  }
  const satellite = satelliteForPortfolio(portfolioId);
  if (satellite) {
    return {
      type: "satellite",
      sourceId: satellite.id,
      status: satellite.status,
      tierId: satellite.tier_id,
      priceLevel: satellite.price_level,
      startsAt: satellite.opens_at,
      endsAt: satellite.locks_at,
      settlementVersion: satellite.settlement_version || "legacy",
      settlementError: satellite.settlement_error || null,
    };
  }
  return { type: "unknown", sourceId: null, status: "unknown", startsAt:null, endsAt: null };
}

function summarize(portfolio) {
  const positions = db.prepare("SELECT * FROM positions WHERE portfolio_id = ? AND quantity > 0").all(portfolio.id);
  const symbols = positions.map((p) => p.symbol);
  const quotes = symbols.length ? getQuotes(symbols) : [];
  const priceMap = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
  let marketValue = 0;
  for (const p of positions) marketValue += (priceMap[p.symbol] ?? p.avg_cost) * p.quantity;
  const totalValue = portfolio.cash_balance + marketValue;
  const availability = tradeAvailability(portfolio.id);
  return {
    id: portfolio.id,
    label: portfolio.label,
    cash: Number(portfolio.cash_balance.toFixed(2)),
    totalValue: Number(totalValue.toFixed(2)),
    pl: Number((totalValue - 100000).toFixed(2)),
    positionCount: positions.length,
    context: contextFor(portfolio.id),
    tradingAllowed: availability.allowed,
    tradingMessage: availability.allowed ? null : availability.reason,
  };
}

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM portfolios WHERE account_id = ? ORDER BY id DESC").all(req.account.id);
  res.json(rows.map(summarize));
});

router.get("/:id", requireAuth, (req, res) => {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) return res.status(404).json({ error: "Portfolio not found" });

  const positions = db.prepare("SELECT * FROM positions WHERE portfolio_id = ? AND quantity > 0").all(portfolio.id);
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
  const availability = tradeAvailability(portfolio.id);
  res.json({
    id: portfolio.id,
    label: portfolio.label,
    cash: Number(portfolio.cash_balance.toFixed(2)),
    positions: enriched,
    totalValue: Number(totalValue.toFixed(2)),
    pl: Number((totalValue - 100000).toFixed(2)),
    context: contextFor(portfolio.id),
    isDegenHours: isDegenHoursPortfolio(portfolio.id),
    tradingAllowed: availability.allowed,
    tradingMessage: availability.allowed ? null : availability.reason,
    serverNow: availability.now.toISOString(),
  });
});

router.post("/:id/trades", requireAuth, (req, res) => {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) return res.status(404).json({ error: "Portfolio not found" });

  const availability = tradeAvailability(portfolio.id);
  if (!availability.allowed) return res.status(400).json({ code:"TRADING_CLOSED", error:availability.reason });

  const { symbol, side, maxAllotment } = req.body || {};
  let { quantity, percent } = req.body || {};
  const normalizedSymbol = String(symbol || "").toUpperCase();
  if (!normalizedSymbol || !["buy", "sell"].includes(side)) {
    return res.status(400).json({ error: "symbol and side ('buy'|'sell') are required" });
  }

  const quote = getQuote(normalizedSymbol);
  if (!quote) return res.status(404).json({ error: "Unknown symbol" });
  const portfolioId = portfolio.id;
  const position = db.prepare("SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?").get(portfolioId, normalizedSymbol);
  const isDegen = isDegenHoursPortfolio(portfolioId);

  if (percent != null) {
    percent = Number(percent);
    if (![25,50,75,100].includes(percent)) return res.status(400).json({ error:"percent must be 25, 50, 75, or 100" });
    const fresh = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId);
    if (side === "sell") {
      if (!position || position.quantity <= 0) return res.status(400).json({ error:`You don't own ${normalizedSymbol}.` });
      quantity = position.quantity * (percent / 100);
    } else if (isDegen) {
      const spend = fresh.cash_balance * (percent / 100);
      quantity = spend / quote.price;
    } else {
      const portfolioValue = totalValueForPortfolio(portfolioId);
      const existingCostBasis = position ? position.avg_cost * position.quantity : 0;
      const targetCostBasis = portfolioValue * MAX_INITIAL_POSITION_PCT * (percent / 100);
      const additional = Math.max(0, targetCostBasis - existingCostBasis);
      if (additional <= 0.01) {
        return res.status(400).json({ error:`${normalizedSymbol} is already at or above the ${percent}% quick-buy target.` });
      }
      quantity = additional / quote.price;
    }
  } else if (side === "buy" && maxAllotment) {
    const existingCostBasis = position ? position.avg_cost * position.quantity : 0;
    const portfolioValue = totalValueForPortfolio(portfolioId);
    const fresh = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId);
    const room = isDegen ? fresh.cash_balance : Math.max(0, portfolioValue * MAX_INITIAL_POSITION_PCT - existingCostBasis);
    quantity = room / quote.price;
    if (quantity <= 0) return res.status(400).json({ error: isDegen ? "No cash left to buy more." : `No room left to buy more ${normalizedSymbol}.` });
  }

  quantity = Number(quantity);
  if (!(quantity > 0)) return res.status(400).json({ error: "A positive quantity is required" });
  const cost = quote.price * quantity;

  if (side === "buy") {
    if (quote.marketCap != null && quote.marketCap < MIN_MARKET_CAP) {
      return res.status(400).json({ error: `${normalizedSymbol} is below the $${(MIN_MARKET_CAP / 1e9).toFixed(0)}B minimum market cap.` });
    }
    if (!isDegen) {
      const existingCostBasis = position ? position.avg_cost * position.quantity : 0;
      const portfolioValue = totalValueForPortfolio(portfolioId);
      const maxAllowed = portfolioValue * MAX_INITIAL_POSITION_PCT;
      if (existingCostBasis + cost > maxAllowed + 0.01) {
        const room = Math.max(0, maxAllowed - existingCostBasis);
        return res.status(400).json({ error: `This would put more than 10% of your portfolio into ${normalizedSymbol} at entry. Max additional buy right now: ~$${room.toFixed(2)}.` });
      }
    }
  }

  try {
    db.exec("BEGIN");
    const fresh = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(portfolioId);
    const currentPosition = db.prepare("SELECT * FROM positions WHERE portfolio_id = ? AND symbol = ?").get(portfolioId, normalizedSymbol);
    if (side === "buy") {
      if (cost > fresh.cash_balance + 0.01) throw new Error("INSUFFICIENT_CASH");
      db.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").run(cost, portfolioId);
      if (currentPosition) {
        const newQty = currentPosition.quantity + quantity;
        const newAvg = (currentPosition.avg_cost * currentPosition.quantity + cost) / newQty;
        db.prepare("UPDATE positions SET quantity = ?, avg_cost = ? WHERE id = ?").run(newQty, newAvg, currentPosition.id);
      } else {
        db.prepare("INSERT INTO positions (portfolio_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)")
          .run(portfolioId, normalizedSymbol, quantity, quote.price);
      }
    } else {
      if (!currentPosition || currentPosition.quantity + 1e-9 < quantity) throw new Error("INSUFFICIENT_SHARES");
      db.prepare("UPDATE portfolios SET cash_balance = cash_balance + ? WHERE id = ?").run(cost, portfolioId);
      db.prepare("UPDATE positions SET quantity = quantity - ? WHERE id = ?").run(quantity, currentPosition.id);
    }
    db.prepare("INSERT INTO trades (portfolio_id, symbol, side, quantity, price) VALUES (?, ?, ?, ?, ?)")
      .run(portfolioId, normalizedSymbol, side, quantity, quote.price);
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    if (e.message === "INSUFFICIENT_CASH") return res.status(400).json({ error: "Not enough cash" });
    if (e.message === "INSUFFICIENT_SHARES") return res.status(400).json({ error: "You don't own enough shares to sell that many" });
    throw e;
  }

  res.json({ ok: true, symbol:normalizedSymbol, side, quantity, price: quote.price, percent: percent ?? null });
});

router.get("/:id/trades", requireAuth, (req, res) => {
  const portfolio = db.prepare("SELECT * FROM portfolios WHERE id = ?").get(req.params.id);
  if (!portfolio || portfolio.account_id !== req.account.id) return res.status(404).json({ error: "Portfolio not found" });
  const trades = db.prepare("SELECT symbol, side, quantity, price, timestamp FROM trades WHERE portfolio_id = ? ORDER BY timestamp DESC LIMIT 100").all(portfolio.id);
  res.json(trades);
});

module.exports = router;
