// Satellite scheduler — Phase 2: the real session matrix.
//
// Four concurrent, independently-scheduled tiers, all using the exact same
// rake + ladder algorithm as the Main Event (server/prizeLadder.js), just
// funding 3,000 STONK Main Event tickets instead of 733,332 STONK Brokers:
//
//   - Full Day   : opens 9:30 AM ET, locks 4:00 PM ET, every trading day
//   - Morning    : opens 9:30 AM ET, locks 1:00 PM ET, every trading day
//   - Afternoon  : opens 1:00 PM ET, locks 4:00 PM ET, every trading day
//   - Weekly Qualifier : opens Monday 00:00 ET, locks Friday 23:59:59 ET —
//     same cadence as the Main Event itself, higher entry fee, feeds tickets
//     all week long instead of resolving in a single day
//
// Trading eligibility ends at 4:00 PM ET (real NYSE/NASDAQ close) per the
// earlier decision — no extended-hours pricing implied.
//
// KNOWN GAP (same as noted in contestScheduler.js): trades aren't actually
// frozen outside these windows yet. That enforcement still needs to be
// built before these session boundaries are more than a display label.

const db = require("./db");
const { totalValueForAccounts } = require("./portfolioValue");
const { computeLadder } = require("./prizeLadder");
const { etDateTime, etCalendarDate, isWeekday, currentWeekWindow } = require("./timeHelpers");
const mainEvent = require("./contestScheduler");

const RAKE = { total: 0.15, platform: 0.10, affiliate: 0.05 };
const TICKET_COST = 3000;

const TIERS = [
  { id: "full_day", name: "Full Day Session", icon: "🔔", entryFee: 300, cadence: "daily", openHour: 9.5, lockHour: 16 },
  { id: "morning", name: "Morning Session", icon: "☀️", entryFee: 300, cadence: "daily", openHour: 9.5, lockHour: 13 },
  { id: "afternoon", name: "Afternoon Session", icon: "🔥", entryFee: 300, cadence: "daily", openHour: 13, lockHour: 16 },
  { id: "weekly_qualifier", name: "Weekly Qualifier", icon: "🎟️", entryFee: 1000, cadence: "weekly" },
];

function hourToParts(hourFloat) {
  const hour = Math.floor(hourFloat);
  const minute = Math.round((hourFloat - hour) * 60);
  return { hour, minute };
}

function dailyWindow(tier, now) {
  const { year, month, day } = etCalendarDate(now);
  const o = hourToParts(tier.openHour);
  const l = hourToParts(tier.lockHour);
  const opensAt = etDateTime(year, month, day, o.hour, o.minute, 0);
  const locksAt = etDateTime(year, month, day, l.hour, l.minute, 0);
  return { opensAt, locksAt };
}

function windowFor(tier, now) {
  if (tier.cadence === "weekly") {
    const { weekStart, weekEnd } = currentWeekWindow(now);
    return { opensAt: weekStart, locksAt: weekEnd };
  }
  return dailyWindow(tier, now);
}

function openNewSatellite(tier, now) {
  const { opensAt, locksAt } = windowFor(tier, now);
  db.prepare(
    `INSERT INTO satellites (tier_id, name, entry_fee, ticket_cost, opens_at, locks_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'open')`
  ).run(tier.id, tier.name, tier.entryFee, TICKET_COST, opensAt.toISOString(), locksAt.toISOString());
}

function ensureOpenSatellites(now = new Date()) {
  for (const tier of TIERS) {
    if (tier.cadence === "daily" && !isWeekday(now)) continue;

    const { opensAt } = windowFor(tier, now);
    if (now.getTime() < opensAt.getTime()) continue; // not open yet today

    const existing = db
      .prepare("SELECT id FROM satellites WHERE tier_id = ? AND opens_at = ?")
      .get(tier.id, opensAt.toISOString());
    if (!existing) openNewSatellite(tier, now);
  }
}

function displayNameFor(accountId) {
  const row = db
    .prepare(
      "SELECT users.display_name FROM accounts JOIN users ON users.id = accounts.user_id WHERE accounts.id = ?"
    )
    .get(accountId);
  return row?.display_name || "Unknown";
}

function resolveSatellite(satellite) {
  const entries = db.prepare("SELECT * FROM satellite_entries WHERE satellite_id = ?").all(satellite.id);

  if (entries.length === 0) {
    db.prepare(
      "UPDATE satellites SET status = 'resolved', resolved_at = ?, pool_gross = 0 WHERE id = ?"
    ).run(new Date().toISOString(), satellite.id);
    return;
  }

  const grossPool = entries.reduce((s, e) => s + e.entry_fee_paid, 0);
  const { unitsFunded: ticketsFunded, remainder } = computeLadder(
    grossPool * (1 - RAKE.total),
    satellite.ticket_cost
  );

  const accountIds = entries.map((e) => e.account_id);
  const valueMap = totalValueForAccounts(accountIds);
  const ranked = entries
    .map((e) => ({
      accountId: e.account_id,
      entryId: e.id,
      entryFeePaid: e.entry_fee_paid,
      pl: (valueMap[e.account_id] ?? e.starting_value) - e.starting_value,
    }))
    .sort((a, b) => b.pl - a.pl);

  db.exec("BEGIN");

  let platformTake = 0;
  let affiliatePaidTotal = 0;
  for (const e of entries) {
    platformTake += Math.round(e.entry_fee_paid * RAKE.platform);
    const paid = mainEvent.payAffiliateCommission(e);
    if (paid > 0) {
      affiliatePaidTotal += paid;
    } else {
      platformTake += Math.round(e.entry_fee_paid * RAKE.affiliate);
    }
  }

  ranked.forEach((r, i) => {
    const rank = i + 1;
    if (rank <= ticketsFunded) {
      db.prepare(
        "INSERT INTO tickets (account_id, source_satellite_id, value_stonk, status) VALUES (?, ?, ?, 'unredeemed')"
      ).run(r.accountId, satellite.id, satellite.ticket_cost);
    } else if (rank === ticketsFunded + 1 && remainder > 0) {
      db.prepare("UPDATE accounts SET stonk_balance = stonk_balance + ? WHERE id = ?").run(
        remainder,
        r.accountId
      );
    }
  });

  db.prepare(
    `UPDATE satellites SET status = 'resolved', resolved_at = ?, pool_gross = ?, player_pool = ?,
     platform_take_stonk = ?, affiliate_paid_stonk = ?, stonk_usd_price = ?, tickets_funded = ?,
     remainder_stonk = ?, remainder_account_id = ?, remainder_display_name = ?
     WHERE id = ?`
  ).run(
    new Date().toISOString(),
    grossPool,
    grossPool - platformTake - affiliatePaidTotal,
    platformTake,
    affiliatePaidTotal,
    mainEvent.currentStonkUsdPriceMicros(),
    ticketsFunded,
    remainder,
    ticketsFunded < ranked.length ? ranked[ticketsFunded].accountId : null,
    ticketsFunded < ranked.length ? displayNameFor(ranked[ticketsFunded].accountId) : null,
    satellite.id
  );
  db.exec("COMMIT");
}

function tick(now = new Date()) {
  ensureOpenSatellites(now);
  const open = db.prepare("SELECT * FROM satellites WHERE status = 'open'").all();
  for (const s of open) {
    if (new Date(s.locks_at).getTime() <= now.getTime()) resolveSatellite(s);
  }
}

function start() {
  tick();
  const interval = setInterval(() => tick(), 15000);
  interval.unref?.();
}

module.exports = { start, tick, TIERS, windowFor };
