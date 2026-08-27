const db = require("./db");
const custodian = require("./custodian");
const { getQuote } = require("./dataProvider");
const { createPortfolio } = require("./portfolioValue");
const { TIERS, FREEROLL_PRIZE_CONFIG } = require("./tierConfig");
const { consumeTicket } = require('./ticketServiceV45');
const { creditEntryContributionInTransaction } = require('./freerollFundingV45');

const MAX_ALLOCATION_PCT = 10; // matches the 10% max-initial-position trading rule, expressed 0-100
const MAIN_EVENT_MAX_ENTRIES = 10;
const V45_ENABLED = process.env.PAYOUT_ENGINE_V45 === 'true';
const PRICE_LEVEL_TO_TICKET = { runner:'runner', low:'clerk', mid:'trader', high:'junior' }; // must match CONFIG.maxEntriesPerAccount in contestScheduler.js — duplicated
// here (not imported) specifically to avoid a circular require: contestScheduler.js already imports this file.

function validateAllocations(allocations, isDegenHours = false) {
  if (!Array.isArray(allocations)) {
    return "Allocations must be an array";
  }
  // Empty array is valid — reserves the room with 100% cash, no picks yet.
  // The trader sets up their actual portfolio later in My Contests, any
  // time before that room opens.
  if (allocations.length === 0) return null;
  let total = 0;
  const seen = new Set();
  for (const a of allocations) {
    if (!a || typeof a.symbol !== "string" || typeof a.percent !== "number" || a.percent <= 0) {
      return "Each allocation needs a symbol and a positive percent";
    }
    if (seen.has(a.symbol)) return `${a.symbol} appears more than once`;
    seen.add(a.symbol);
    // Degen Hours is the one deliberate exception to the 10% rule — same
    // exception already enforced on the live trade route in
    // routes/portfolios.js, just applied here too so pre-registering picks
    // for Degen Hours doesn't get rejected before the room even opens.
    if (!isDegenHours && a.percent > MAX_ALLOCATION_PCT) {
      return `${a.symbol}: ${a.percent}% exceeds the 10% max position size rule`;
    }
    if (a.percent > 100) return `${a.symbol}: ${a.percent}% isn't a valid percentage`;
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

    if (tier && tier.maxEntriesPerAccount != null && existingCount >= tier.maxEntriesPerAccount) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Already at the max entries for this room",
        pa.id
      );
      continue;
    }

    // A won prize (source = 'freeroll_prize' or 'freeroll_bonus') was
    // already paid for the moment it was awarded — out of that category's
    // own freeroll fund, itself built from real paid entries elsewhere.
    // It should NEVER be charged again here, and it shouldn't count
    // toward THIS room's own pool either, since nothing was actually paid
    // into this specific room by this entrant. Before this fix, every
    // "free" prize was silently charging the winner the full entry fee
    // anyway — a real bug, not by design.
    const isWonPrize = pa.source === "freeroll_prize" || pa.source === "freeroll_bonus";
    const totalFee = isWonPrize ? 0 : tier ? tier.entryFee : satellite.entry_fee;
    const poolContribution = isWonPrize ? 0 : satellite.entry_fee;
    const ticketType = !isWonPrize ? PRICE_LEVEL_TO_TICKET[satellite.price_level] : null;
    const entryTicket = ticketType ? db.prepare(`SELECT * FROM tickets WHERE account_id=? AND ticket_type=? AND status='unredeemed' ORDER BY created_at ASC,id ASC LIMIT 1`).get(pa.account_id,ticketType) : null;
    if (!isWonPrize && !entryTicket && (!account || account.stonk_balance < totalFee)) {
      db.prepare("UPDATE pending_allocations SET status='failed', fail_reason=? WHERE id=?").run(
        "Not enough STONK or matching ticket at open",
        pa.id
      );
      continue;
    }

    const label = `${satellite.name} · ${new Date().toLocaleDateString()} (Entry ${existingCount + 1})`;
    const portfolioId = createPortfolio(pa.account_id, label);
    db.exec("BEGIN");
    if (!isWonPrize && entryTicket) {
      consumeTicket({ ticketId:entryTicket.id, accountId:pa.account_id, appliedToSatelliteId:satellite.id });
    } else if (!isWonPrize && totalFee > 0) {
      custodian.debit(pa.account_id, totalFee, "satellite_entry", { referenceType: "satellite", referenceId: satellite.id });
    }
    const entryInfo = db.prepare(
      "INSERT INTO satellite_entries (satellite_id, account_id, portfolio_id, entry_fee_paid) VALUES (?, ?, ?, ?)"
    ).run(satellite.id, pa.account_id, portfolioId, poolContribution);

    if (!isWonPrize && tier && tier.surcharge > 0) {
      if (V45_ENABLED) {
        creditEntryContributionInTransaction({ entryId:Number(entryInfo.lastInsertRowid), categoryId:tier.categoryId, amountStonk:tier.surcharge });
      } else {
        db.prepare("UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk + ? WHERE category_id = ?").run(tier.surcharge, tier.categoryId);
        const fund = db.prepare("SELECT * FROM freeroll_fund WHERE category_id = ?").get(tier.categoryId);
        const threshold = FREEROLL_PRIZE_CONFIG[tier.categoryId].threshold;
        if (fund.accumulated_stonk >= threshold) {
          db.prepare(`UPDATE freeroll_fund SET accumulated_stonk = accumulated_stonk - ?, prizes_available = prizes_available + 1,
           total_prizes_funded_lifetime = total_prizes_funded_lifetime + 1 WHERE category_id = ?`).run(threshold, tier.categoryId);
        }
      }
    }

    applyAllocationToPortfolio(portfolioId, JSON.parse(pa.allocations_json));
    db.prepare(
      "UPDATE pending_allocations SET status='applied', applied_to_satellite_id=?, applied_at=? WHERE id=?"
    ).run(satellite.id, new Date().toISOString(), pa.id);
    db.exec("COMMIT");
  }
}

function applyPendingContestAllocations(_contest) {
  // Main Event is history-only. Any stale pending reservations are failed
  // explicitly so no future scheduler change can silently create entries.
  const info = db.prepare(`UPDATE pending_allocations
    SET status='failed', fail_reason='Main Event retired'
    WHERE target_type='contest' AND target_tier_id='main_event' AND status='pending'`).run();
  return { retired: true, failedPending: Number(info.changes || 0) };
}

module.exports = {
  validateAllocations,
  applyAllocationToPortfolio,
  applyPendingSatelliteAllocations,
  applyPendingContestAllocations,
  MAX_ALLOCATION_PCT,
};
