// Market-open order scheduler.
//
// Distinct from allocationEngine.js's tier-triggered auto-entry: these
// orders target a portfolio that ALREADY EXISTS (already joined), queued to
// fire at a specific future market open rather than immediately. Runs on
// its own lightweight tick, same pattern as the other schedulers.

const db = require("./db");
const { applyAllocationToPortfolio } = require("./allocationEngine");
const { totalValueForPortfolio } = require("./portfolioValue");

const MAX_ALLOCATION_PCT = 10; // must match allocationEngine.js / routes/portfolios.js

// Duplicated from routes/portfolios.js (not exported there) — same check,
// same exception. Without this, a scheduled order for a Degen Hours
// portfolio would get incorrectly rejected at execution time for
// exceeding a cap that doesn't apply there.
function isDegenHoursPortfolio(portfolioId) {
  const satelliteEntry = db
    .prepare(
      `SELECT satellites.tier_id FROM satellite_entries
       JOIN satellites ON satellites.id = satellite_entries.satellite_id
       WHERE satellite_entries.portfolio_id = ?`
    )
    .get(portfolioId);
  return satelliteEntry?.tier_id === "hourly";
}

function contestStatusForPortfolio(portfolioId) {
  const ce = db
    .prepare(
      `SELECT contests.status FROM contest_entries JOIN contests ON contests.id = contest_entries.contest_id WHERE portfolio_id = ?`
    )
    .get(portfolioId);
  if (ce) return ce.status;
  const se = db
    .prepare(
      `SELECT satellites.status FROM satellite_entries JOIN satellites ON satellites.id = satellite_entries.satellite_id WHERE portfolio_id = ?`
    )
    .get(portfolioId);
  if (se) return se.status;
  return null;
}

// Re-validates against the portfolio's CURRENT state at execution time —
// the world may have changed since this order was queued (manual trades
// made in the meantime, existing positions grown, etc). Returns an error
// string, or null if the whole order is safe to fire as-is.
function revalidateAgainstLivePortfolio(portfolioId, allocations, baseValue) {
  const positions = db.prepare("SELECT * FROM positions WHERE portfolio_id = ? AND quantity > 0").all(portfolioId);
  const costBasisBySymbol = Object.fromEntries(positions.map((p) => [p.symbol, p.avg_cost * p.quantity]));
  const isDegenHours = isDegenHoursPortfolio(portfolioId);

  let totalNewCost = 0;
  for (const a of allocations) {
    const existing = costBasisBySymbol[a.symbol] || 0;
    const newCost = baseValue * (a.percent / 100);
    if (!isDegenHours && existing + newCost > baseValue * (MAX_ALLOCATION_PCT / 100) + 0.01) {
      return `${a.symbol} would exceed the ${MAX_ALLOCATION_PCT}% max position size given what's already held`;
    }
    totalNewCost += newCost;
  }

  const portfolio = db.prepare("SELECT cash_balance FROM portfolios WHERE id = ?").get(portfolioId);
  if (totalNewCost > portfolio.cash_balance + 0.01) {
    return "Not enough cash left in the portfolio to cover this order at market open";
  }
  return null;
}

function tick(now = new Date()) {
  const due = db
    .prepare("SELECT * FROM scheduled_orders WHERE status = 'pending' AND target_open_at <= ?")
    .all(now.toISOString());

  for (const order of due) {
    const status = contestStatusForPortfolio(order.portfolio_id);
    if (status !== "open") {
      db.prepare("UPDATE scheduled_orders SET status = 'failed', fail_reason = ? WHERE id = ?").run(
        "Contest was no longer open when the market opened",
        order.id
      );
      continue;
    }

    const allocations = JSON.parse(order.allocations_json);
    const baseValue = totalValueForPortfolio(order.portfolio_id);
    const err = revalidateAgainstLivePortfolio(order.portfolio_id, allocations, baseValue);
    if (err) {
      db.prepare("UPDATE scheduled_orders SET status = 'failed', fail_reason = ? WHERE id = ?").run(err, order.id);
      continue;
    }

    db.exec("BEGIN");
    applyAllocationToPortfolio(order.portfolio_id, allocations, baseValue);
    db.prepare("UPDATE scheduled_orders SET status = 'applied', applied_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      order.id
    );
    db.exec("COMMIT");
  }
}

function start() {
  tick();
  const interval = setInterval(() => tick(), 15000);
  interval.unref?.();
}

module.exports = { start, tick };
