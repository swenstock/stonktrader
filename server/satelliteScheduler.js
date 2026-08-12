// Satellite scheduler — the full session x price-level matrix.
//
// Four categories (Full Day / Morning / Afternoon / Weekly Qualifier), each
// running at three price levels (Low/Mid/High) — 12 concurrent satellites
// total. Every one uses the exact same rake + ladder algorithm as the Main
// Event, just funding 3,000 STONK Main Event tickets instead of Brokers.
//
// Trading eligibility ends at 4:00 PM ET (real NYSE/NASDAQ close) — no
// extended-hours pricing implied.
//
// KNOWN GAP: trades aren't actually frozen outside these windows yet.

const db = require("./db");
const { totalValueForPortfolios } = require("./portfolioValue");
const { computeLadder } = require("./prizeLadder");
const { etDateTime, etCalendarDate, isWeekday, currentWeekWindow } = require("./timeHelpers");
const mainEvent = require("./contestScheduler");
const { applyPendingSatelliteAllocations } = require("./allocationEngine");

const RAKE = { total: 0.15, platform: 0.10, affiliate: 0.05 };
const TICKET_COST = 3000;

const CATEGORIES = [
  { id: "full_day", name: "Full Day", icon: "🔔", cadence: "daily", openHour: 9.5, lockHour: 16 },
  { id: "morning", name: "Morning", icon: "☀️", cadence: "daily", openHour: 9.5, lockHour: 13 },
  { id: "afternoon", name: "Afternoon", icon: "🔥", cadence: "daily", openHour: 13, lockHour: 16 },
  { id: "weekly_qualifier", name: "Weekly Qualifier", icon: "🎟️", cadence: "weekly" },
];

const PRICE_LEVELS = {
  daily: { low: 100, mid: 300, high: 750 },
  weekly: { low: 100, mid: 300, high: 750 }, // same as daily — cheap access to a 3,000 STONK Main Event ticket is the whole point
};

// Flatten into 12 concrete tiers.
const TIERS = CATEGORIES.flatMap((cat) =>
  ["low", "mid", "high"].map((level) => ({
    id: `${cat.id}_${level}`,
    categoryId: cat.id,
    categoryName: cat.name,
    icon: cat.icon,
    priceLevel: level,
    name: `${cat.name} — ${level[0].toUpperCase()}${level.slice(1)}`,
    entryFee: PRICE_LEVELS[cat.cadence][level],
    cadence: cat.cadence,
    openHour: cat.openHour,
    lockHour: cat.lockHour,
  }))
);

function hourToParts(hourFloat) {
  const hour = Math.floor(hourFloat);
  const minute = Math.round((hourFloat - hour) * 60);
  return { hour, minute };
}

function dailyWindow(tier, now) {
  const { year, month, day } = etCalendarDate(now);
  const o = hourToParts(tier.openHour);
  const l = hourToParts(tier.lockHour);
  return {
    opensAt: etDateTime(year, month, day, o.hour, o.minute, 0),
    locksAt: etDateTime(year, month, day, l.hour, l.minute, 0),
  };
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
  const info = db
    .prepare(
      `INSERT INTO satellites (tier_id, price_level, name, entry_fee, ticket_cost, opens_at, locks_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`
    )
    .run(
      tier.categoryId,
      tier.priceLevel,
      tier.name,
      tier.entryFee,
      TICKET_COST,
      opensAt.toISOString(),
      locksAt.toISOString()
    );

  const newSatellite = db.prepare("SELECT * FROM satellites WHERE id = ?").get(info.lastInsertRowid);
  applyPendingSatelliteAllocations(newSatellite);
}

function ensureOpenSatellites(now = new Date()) {
  for (const tier of TIERS) {
    if (tier.cadence === "daily" && !isWeekday(now)) continue;

    const { opensAt } = windowFor(tier, now);
    if (now.getTime() < opensAt.getTime()) continue;

    const existing = db
      .prepare("SELECT id FROM satellites WHERE tier_id = ? AND price_level = ? AND opens_at = ?")
      .get(tier.categoryId, tier.priceLevel, opensAt.toISOString());
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
      `UPDATE satellites SET status = 'resolved', resolved_at = ?, pool_gross = 0, player_pool = 0,
       platform_take_stonk = 0, affiliate_paid_stonk = 0, tickets_funded = 0, remainder_stonk = 0
       WHERE id = ?`
    ).run(new Date().toISOString(), satellite.id);
    return;
  }

  const grossPool = entries.reduce((s, e) => s + e.entry_fee_paid, 0);
  const { unitsFunded: ticketsFunded, remainder } = computeLadder(
    grossPool * (1 - RAKE.total),
    satellite.ticket_cost
  );

  const portfolioIds = entries.map((e) => e.portfolio_id);
  const valueMap = totalValueForPortfolios(portfolioIds);
  const ranked = entries
    .map((e) => ({
      accountId: e.account_id,
      entryId: e.id,
      entryFeePaid: e.entry_fee_paid,
      pl: (valueMap[e.portfolio_id] ?? 100000) - 100000,
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
    let prizeType = "none",
      prizeAmount = null;
    if (rank <= ticketsFunded) {
      prizeType = "ticket";
      db.prepare(
        "INSERT INTO tickets (account_id, source_satellite_id, value_stonk, status) VALUES (?, ?, ?, 'unredeemed')"
      ).run(r.accountId, satellite.id, satellite.ticket_cost);
    } else if (rank === ticketsFunded + 1 && remainder > 0) {
      prizeType = "stonk";
      prizeAmount = remainder;
      db.prepare("UPDATE accounts SET stonk_balance = stonk_balance + ? WHERE id = ?").run(
        remainder,
        r.accountId
      );
    }
    db.prepare(
      "INSERT INTO satellite_results (satellite_id, account_id, rank, pl, prize_type, prize_amount) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(satellite.id, r.accountId, rank, r.pl, prizeType, prizeAmount);
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

module.exports = { start, tick, TIERS, CATEGORIES };
