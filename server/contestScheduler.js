// Main Event scheduler.
//
// One room, open Monday-Friday (US Eastern Time). Flat 15% rake off every
// entry's gross (10% platform + 5% affiliate). The remaining 85% "player
// pool" funds as many Activated Stonk Brokers as it supports via the ladder
// algorithm (server/prizeLadder.js) — not just zero-or-one anymore. Whatever
// doesn't fund a full Broker goes winner-take-all to the next finishing
// position. Every entrant gets ranked and recorded in contest_results, not
// just the winner, so "you finished #4" is something the app can actually
// show.
//
// KNOWN GAP: this does not yet enforce real market-hours trading freezes —
// trades can be placed 24/7 regardless of session windows. That's real
// infrastructure that still needs to be built before session-based
// satellites (Full Day / Morning / Afternoon) can be trusted to mean what
// they say.

const db = require("./db");
const { totalValueForAccounts } = require("./portfolioValue");
const { computeLadder } = require("./prizeLadder");
const { isWeekday, currentWeekWindow } = require("./timeHelpers");

const CONFIG = {
  entryFee: 3000, // STONK — the Main Event ticket price
  brokerUnitCost: 733332, // 666,666 acquire + 66,666 activate
  rakeTotal: 0.15,
  rakePlatform: 0.10,
  rakeAffiliate: 0.05,
  minEntrants: 2,
};

// ---- STONK/USD price snapshot (manual for now — see README for real-feed swap-in) ----
function currentStonkUsdPriceMicros() {
  const price = Number(process.env.STONK_USD_PRICE || "0.0346");
  return Math.round(price * 1e6); // stored as integer micros to avoid float drift
}

// ---- Contest lifecycle ----

function openNewContest(now = new Date()) {
  const { weekStart, weekEnd } = currentWeekWindow(now);
  db.prepare(
    `INSERT INTO contests (week_start, week_end, entry_fee, broker_unit_cost, status)
     VALUES (?, ?, ?, ?, 'open')`
  ).run(weekStart.toISOString(), weekEnd.toISOString(), CONFIG.entryFee, CONFIG.brokerUnitCost);
}

function ensureOpenContest(now = new Date()) {
  if (!isWeekday(now)) return;
  const { weekStart } = currentWeekWindow(now);
  const existing = db.prepare("SELECT id FROM contests WHERE week_start = ?").get(weekStart.toISOString());
  if (!existing) openNewContest(now);
}

function resolveContest(contest) {
  const entries = db.prepare("SELECT * FROM contest_entries WHERE contest_id = ?").all(contest.id);

  if (entries.length < CONFIG.minEntrants) {
    db.exec("BEGIN");
    for (const e of entries) {
      if (!e.paid_with_ticket_id) {
        db.prepare("UPDATE accounts SET stonk_balance = stonk_balance + ? WHERE id = ?").run(
          e.entry_fee_paid,
          e.account_id
        );
      } else {
        db.prepare(
          "UPDATE tickets SET status = 'unredeemed', applied_to_contest_id = NULL, applied_at = NULL WHERE id = ?"
        ).run(e.paid_with_ticket_id);
      }
      db.prepare("UPDATE contest_entries SET escrow_status = 'refunded' WHERE id = ?").run(e.id);
    }
    db.prepare(
      "UPDATE contests SET status = 'resolved', resolved_at = ?, pool_gross = 0 WHERE id = ?"
    ).run(new Date().toISOString(), contest.id);
    db.exec("COMMIT");
    return;
  }

  const grossPool = entries.reduce((s, e) => s + e.entry_fee_paid, 0);
  const { unitsFunded: brokersFunded, remainder } = computeLadder(
    grossPool * (1 - CONFIG.rakeTotal),
    CONFIG.brokerUnitCost
  );
  const accountIds = entries.map((e) => e.account_id);
  const valueMap = totalValueForAccounts(accountIds);

  db.exec("BEGIN");
  for (const e of entries) {
    db.prepare("UPDATE contest_entries SET escrow_status = 'captured' WHERE id = ?").run(e.id);
  }

  // Rake accounting, entry by entry: 10% always goes to platform. The other
  // 5% is "affiliate share" — paid to a referrer if one exists, otherwise it
  // rolls into platform revenue too (there's no one else to pay it to). This
  // keeps platform_take + affiliate_paid always summing to exactly 15% of
  // gross, with nothing silently vanishing.
  let platformTake = 0;
  let affiliatePaidTotal = 0;
  for (const e of entries) {
    platformTake += Math.round(e.entry_fee_paid * CONFIG.rakePlatform);
    const paid = payAffiliateCommission(e);
    if (paid > 0) {
      affiliatePaidTotal += paid;
    } else {
      platformTake += Math.round(e.entry_fee_paid * CONFIG.rakeAffiliate);
    }
  }
  const playerPool = grossPool - platformTake - affiliatePaidTotal;

  const ranked = entries
    .map((e) => ({
      accountId: e.account_id,
      entryId: e.id,
      pl: (valueMap[e.account_id] ?? e.starting_value) - e.starting_value,
    }))
    .sort((a, b) => b.pl - a.pl);

  ranked.forEach((r, i) => {
    const rank = i + 1;
    let prizeType = "none",
      prizeAmount = null;
    if (rank <= brokersFunded) {
      prizeType = "broker";
    } else if (rank === brokersFunded + 1 && remainder > 0) {
      prizeType = "stonk";
      prizeAmount = remainder;
      db.prepare("UPDATE accounts SET stonk_balance = stonk_balance + ? WHERE id = ?").run(
        remainder,
        r.accountId
      );
    }
    db.prepare(
      "INSERT INTO contest_results (contest_id, account_id, rank, pl, prize_type, prize_amount) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(contest.id, r.accountId, rank, r.pl, prizeType, prizeAmount);
  });

  db.prepare(
    `UPDATE contests SET status = 'resolved', resolved_at = ?, pool_gross = ?, player_pool = ?,
     platform_take_stonk = ?, affiliate_paid_stonk = ?, stonk_usd_price = ?, brokers_funded = ?,
     remainder_stonk = ?, remainder_account_id = ?, remainder_display_name = ?
     WHERE id = ?`
  ).run(
    new Date().toISOString(),
    grossPool,
    playerPool,
    platformTake,
    affiliatePaidTotal,
    currentStonkUsdPriceMicros(),
    brokersFunded,
    remainder,
    brokersFunded < ranked.length ? ranked[brokersFunded].accountId : null,
    brokersFunded < ranked.length ? displayNameFor(ranked[brokersFunded].accountId) : null,
    contest.id
  );
  db.exec("COMMIT");
}

function displayNameFor(accountId) {
  const row = db
    .prepare(
      "SELECT users.display_name FROM accounts JOIN users ON users.id = accounts.user_id WHERE accounts.id = ?"
    )
    .get(accountId);
  return row?.display_name || "Unknown";
}

function payAffiliateCommission(entry) {
  const account = db.prepare("SELECT user_id FROM accounts WHERE id = ?").get(entry.account_id);
  const user = db.prepare("SELECT referred_by_user_id FROM users WHERE id = ?").get(account.user_id);
  if (!user?.referred_by_user_id) return 0;
  const referrerAccount = db
    .prepare("SELECT id FROM accounts WHERE user_id = ?")
    .get(user.referred_by_user_id);
  if (!referrerAccount) return 0;

  const commission = Math.round(entry.entry_fee_paid * CONFIG.rakeAffiliate);
  if (commission <= 0) return 0;

  db.prepare("UPDATE accounts SET stonk_balance = stonk_balance + ? WHERE id = ?").run(
    commission,
    referrerAccount.id
  );
  db.prepare(
    "INSERT INTO referral_earnings (referrer_user_id, referred_user_id, contest_entry_id, amount) VALUES (?, ?, ?, ?)"
  ).run(user.referred_by_user_id, account.user_id, entry.id, commission);
  return commission;
}

function tick(now = new Date()) {
  ensureOpenContest(now);
  const open = db.prepare("SELECT * FROM contests WHERE status = 'open'").all();
  for (const contest of open) {
    if (new Date(contest.week_end).getTime() <= now.getTime()) resolveContest(contest);
  }
}

function start() {
  tick();
  const interval = setInterval(() => tick(), 15000);
  interval.unref?.();
}

module.exports = {
  start,
  tick,
  CONFIG,
  currentWeekWindow,
  isWeekday,
  currentStonkUsdPriceMicros,
  payAffiliateCommission,
};
