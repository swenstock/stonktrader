const db = require("./db");
const { getQuote } = require("./dataProvider");
const { createPortfolio } = require("./portfolioValue");
const { TIERS, FREEROLL_FUND_THRESHOLD } = require("./tierConfig");

const MAX_ALLOCATION_PCT = 10; // matches the 10% max-initial-position trading rule, expressed 0-100

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
      return `${a.symbol}: ${a.percent}% exceeds the 10% max position size rule`;
    }
    if (!getQuote(a.symbol)) return `Unknown symbol: ${a.symbol}`;
    total += a.percent;
  }
  if (total > 100) return "Allocations add up to more than 100%";
  return null;
}

// Executes the allocation as a set of BUY trades against a portfolio, sized
// as percentages of `baseValue`. For a freshly-created portfolio (tier
// auto-entry), baseValue is always exactly 100000. For an ALREADY-EXISTING
// portfolio (the market-open scheduled-order case), baseValue must be that
// portfolio's live current value — never hardcode 100000 for that path, or
// the sizing will be wrong for anyone who's already traded.
function applyAllocationToPortfolio(portfolioId, allocations, baseValue = 100000) {
  for (const a of allocations) {
    const quote = getQuote(a.symbol);
    if (!quote) continue; // shouldn't happen, validated at creation time
    const cost = baseValue * (a.percent / 100);
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

  const tier = TIERS.find((t) => t.categoryId === satellite.tier_id && t.priceLevel === satellite.price_level);

  for (const pa of pending) {
    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(pa.account_id);
    const existingCount = db
      .prepare("SELECT COUNT(*) as n FROM satellite_entries WHERE satellite_id = ? AND account_id = ?")
      .get(satellite.id, pa.account_id).n;

    if (tier && existingCount >= tier.maxEntriesPerAccount) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Already at the max entries for this room",
        pa.id
      );
      continue;
    }
    const totalFee = tier ? tier.entryFee : satellite.entry_fee;
    if (!account || account.stonk_balance < totalFee) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Not enough STONK at open",
        pa.id
      );
      continue;
    }

    const portfolioId = createPortfolio(pa.account_id, `${satellite.name} · ${new Date().toLocaleDateString()}`);
    db.exec("BEGIN");
    db.prepare("UPDATE accounts SET stonk_balance = stonk_balance - ? WHERE id = ?").run(totalFee, pa.account_id);
    db.prepare(
      "INSERT INTO satellite_entries (satellite_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
    ).run(satellite.id, pa.account_id, portfolioId, satellite.entry_fee); // satellite.entry_fee = poolFee already

    if (tier && tier.surcharge > 0) {
      db.prepare("UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + ? WHERE id = 1").run(tier.surcharge);
      const fund = db.prepare("SELECT * FROM freeroll_fund WHERE id = 1").get();
      if (fund.accumulated_stonk >= FREEROLL_FUND_THRESHOLD) {
        db.prepare(
          `UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk - ?, tickets_available = tickets_available + 1,
           total_tickets_funded_lifetime = total_tickets_funded_lifetime + 1 WHERE id = 1`
        ).run(FREEROLL_FUND_THRESHOLD);
      }
    }

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
  applyAllocationToPortfolio,
  applyPendingSatelliteAllocations,
  applyPendingContestAllocations,
  MAX_ALLOCATION_PCT,
};
