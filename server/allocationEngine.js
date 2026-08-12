const db = require("./db");
const { getQuote } = require("./dataProvider");
const { createPortfolio } = require("./portfolioValue");

const MAX_ALLOCATION_PCT = 5; // matches the 5% max-initial-position trading rule, expressed 0-100

function validateAllocations(allocations) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return "At least one allocation is required";
  }
  let total = 0;
  const seen = new Set();
  for (const a of allocations) {
    if (!a || typeof a.symbol !== "string" || typeof a.percent !== "number" || a.percent <= 0) {
      return "Each allocation needs a symbol and a positive percent";
    }
    if (seen.has(a.symbol)) return `${a.symbol} appears more than once`;
    seen.add(a.symbol);
    if (a.percent > MAX_ALLOCATION_PCT) {
      return `${a.symbol}: ${a.percent}% exceeds the 5% max position size rule`;
    }
    if (!getQuote(a.symbol)) return `Unknown symbol: ${a.symbol}`;
    total += a.percent;
  }
  if (total > 100) return "Allocations add up to more than 100%";
  return null;
}

// Executes the allocation as a set of opening BUY trades against a freshly
// created ($100,000) portfolio. Uses whatever the live quote is at the
// moment the contest/satellite actually opens — this IS the "filled on
// open" behavior.
function applyAllocationToPortfolio(portfolioId, allocations) {
  for (const a of allocations) {
    const quote = getQuote(a.symbol);
    if (!quote) continue; // shouldn't happen, validated at creation time
    const cost = 100000 * (a.percent / 100);
    const quantity = cost / quote.price;
    db.prepare("UPDATE portfolios SET cash_balance = cash_balance - ? WHERE id = ?").run(cost, portfolioId);
    db.prepare(
      "INSERT INTO positions (portfolio_id, symbol, quantity, avg_cost) VALUES (?, ?, ?, ?)"
    ).run(portfolioId, a.symbol, quantity, quote.price);
    db.prepare(
      "INSERT INTO trades (portfolio_id, symbol, side, quantity, price) VALUES (?, ?, 'buy', ?, ?)"
    ).run(portfolioId, a.symbol, quantity, quote.price);
  }
}

function applyPendingSatelliteAllocations(satellite) {
  const pending = db
    .prepare(
      "SELECT * FROM pending_allocations WHERE target_type='satellite' AND target_tier_id=? AND target_price_level=? AND status='pending'"
    )
    .all(satellite.tier_id, satellite.price_level);

  for (const pa of pending) {
    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(pa.account_id);
    const existingEntry = db
      .prepare("SELECT id FROM satellite_entries WHERE satellite_id = ? AND account_id = ?")
      .get(satellite.id, pa.account_id);

    if (existingEntry) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Already entered this satellite another way",
        pa.id
      );
      continue;
    }
    if (!account || account.stonk_balance < satellite.entry_fee) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Not enough STONK at open",
        pa.id
      );
      continue;
    }

    const portfolioId = createPortfolio(pa.account_id, `${satellite.name} · ${new Date().toLocaleDateString()}`);
    db.exec("BEGIN");
    db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(
      satellite.entry_fee,
      pa.account_id
    );
    db.prepare(
      "INSERT INTO satellite_entries (satellite_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
    ).run(satellite.id, pa.account_id, portfolioId, satellite.entry_fee);
    applyAllocationToPortfolio(portfolioId, JSON.parse(pa.allocations_json));
    db.prepare(
      "UPDATE pending_allocations SET status='applied', applied_to_satellite_id=?, applied_at=? WHERE id=?"
    ).run(satellite.id, new Date().toISOString(), pa.id);
    db.exec("COMMIT");
  }
}

function applyPendingContestAllocations(contest) {
  const pending = db
    .prepare(
      "SELECT * FROM pending_allocations WHERE target_type='contest' AND target_tier_id='main_event' AND status='pending'"
    )
    .all();

  for (const pa of pending) {
    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(pa.account_id);
    const existingEntry = db
      .prepare("SELECT id FROM contest_entries WHERE contest_id = ? AND account_id = ?")
      .get(contest.id, pa.account_id);

    if (existingEntry) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Already entered this Main Event another way",
        pa.id
      );
      continue;
    }

    const ticket = db
      .prepare("SELECT * FROM tickets WHERE account_id = ? AND status = 'unredeemed' ORDER BY created_at ASC LIMIT 1")
      .get(pa.account_id);

    if (!ticket && (!account || account.stonk_balance < contest.entry_fee)) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Not enough STONK at open (and no unredeemed ticket)",
        pa.id
      );
      continue;
    }

    const label = `Main Event · Week of ${new Date(contest.week_start).toLocaleDateString()}`;
    const portfolioId = createPortfolio(pa.account_id, label);
    db.exec("BEGIN");
    if (ticket) {
      db.prepare(
        "INSERT INTO contest_entries (contest_id, account_id, portfolio_id, entry_fee_paid, paid_with_ticket_id) VALUES (?, ?, ?, ?, ?)"
      ).run(contest.id, pa.account_id, portfolioId, contest.entry_fee, ticket.id);
      db.prepare(
        "UPDATE tickets SET status = 'applied', applied_to_contest_id = ?, applied_at = ? WHERE id = ?"
      ).run(contest.id, new Date().toISOString(), ticket.id);
    } else {
      db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(
        contest.entry_fee,
        pa.account_id
      );
      db.prepare(
        "INSERT INTO contest_entries (contest_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
      ).run(contest.id, pa.account_id, portfolioId, contest.entry_fee);
    }
    applyAllocationToPortfolio(portfolioId, JSON.parse(pa.allocations_json));
    db.prepare(
      "UPDATE pending_allocations SET status='applied', applied_to_contest_id=?, applied_at=? WHERE id=?"
    ).run(contest.id, new Date().toISOString(), pa.id);
    db.exec("COMMIT");
  }
}

module.exports = {
  validateAllocations,
  applyPendingSatelliteAllocations,
  applyPendingContestAllocations,
  MAX_ALLOCATION_PCT,
};
