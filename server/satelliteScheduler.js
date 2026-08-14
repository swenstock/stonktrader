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
const { etDateTime, etCalendarDate, easternParts, isWeekday, currentWeekWindow } = require("./timeHelpers");
const mainEvent = require("./contestScheduler");
const { applyPendingSatelliteAllocations } = require("./allocationEngine");
const { CATEGORIES, PRICE_LEVEL_NAMES, TIERS, FREEROLL_SURCHARGE, FREEROLL_PRIZE_CONFIG } = require("./tierConfig");

const RAKE = { total: 0.15, platform: 0.10, affiliate: 0.05 };
const TICKET_COST = 3000;

function hourToParts(hourFloat) {
  const hour = Math.floor(hourFloat);
  const minute = Math.round((hourFloat - hour) * 60);
  return { hour, minute };
}

const TEST_MODE = process.env.TEST_MODE === "true";
const TEST_SATELLITE_MINUTES = Number(process.env.TEST_SATELLITE_MINUTES) || 3;

function dailyWindow(tier, now) {
  const { year, month, day } = etCalendarDate(now);
  const o = hourToParts(tier.openHour);
  const l = hourToParts(tier.lockHour);
  return {
    opensAt: etDateTime(year, month, day, o.hour, o.minute, 0),
    locksAt: etDateTime(year, month, day, l.hour, l.minute, 0),
  };
}

// Degen Hours runs 6 slots a day, offset 30 minutes from the top of the
// hour to tile perfectly against real market hours: 9:30-10:30,
// 10:30-11:30, 11:30-12:30, 12:30-1:30, 1:30-2:30, 2:30-3:30. The last 30
// minutes of the session (3:30-4:00) deliberately belongs to Race to the
// Close instead — not a 7th Degen Hours slot. Weekdays only, real market
// hours only — no more 24/7. Returns null outside that window so the
// scheduler knows to skip entirely, not just wait.
function degenHoursWindow(now) {
  if (!isWeekday(now)) return null;
  const p = easternParts(now);
  const h = Number(p.hour), m = Number(p.minute);
  const slotHour = m >= 30 ? h : h - 1; // which :30-anchored slot `now` currently falls in
  if (slotHour < 9 || slotHour > 14) return null; // valid slots: 9:30 through 2:30 only
  const { year, month, day } = etCalendarDate(now);
  const opensAt = etDateTime(year, month, day, slotHour, 30, 0);
  const locksAt = new Date(opensAt.getTime() + 60 * 60000);
  return { opensAt, locksAt };
}

function windowFor(tier, now) {
  // TEST_MODE: ignore real market hours entirely — every category (Full
  // Day, Morning, Afternoon, Weekly, Degen Hours, Race to the Close) is
  // always available regardless of real time of day or day of week,
  // cycling on a short fixed duration instead. Off by default — only for
  // local/staging testing, never set this in a real deployment.
  if (TEST_MODE) {
    return { opensAt: now, locksAt: new Date(now.getTime() + TEST_SATELLITE_MINUTES * 60000) };
  }
  if (tier.cadence === "weekly") {
    const { weekStart, weekEnd } = currentWeekWindow(now);
    return { opensAt: weekStart, locksAt: weekEnd };
  }
  if (tier.cadence === "hourly") {
    return degenHoursWindow(now); // may be null — see above
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
      tier.poolFee, // base only — surcharge is charged separately at entry time, never counted in this room's own pool
      TICKET_COST,
      opensAt.toISOString(),
      locksAt.toISOString()
    );

  const newSatellite = db.prepare("SELECT * FROM satellites WHERE id = ?").get(info.lastInsertRowid);
  applyPendingSatelliteAllocations(newSatellite);
}

function ensureOpenSatellites(now = new Date()) {
  for (const tier of TIERS) {
    if (TEST_MODE) {
      // Always available, always cycling — the moment a tier has no OPEN
      // room, immediately open a fresh one (short test duration). No
      // weekday check, no real-hour check, "afternoon" is tradeable at
      // 3am on a Sunday just as much as any other tier.
      const openNow = db
        .prepare("SELECT id FROM satellites WHERE tier_id = ? AND price_level = ? AND status = 'open'")
        .get(tier.categoryId, tier.priceLevel);
      if (!openNow) openNewSatellite(tier, now);
      continue;
    }

    if ((tier.cadence === "daily" || tier.cadence === "hourly") && !isWeekday(now)) continue;

    const window = windowFor(tier, now);
    if (!window) continue; // outside valid hours entirely (Degen Hours outside 9:30-3:30) — not just "not yet", skip until the next valid slot
    const { opensAt } = window;
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

  let ticketsFunded, remainder, freerollPrizeType;
  if (satellite.price_level === "free") {
    // Freeroll rooms never fund a prize from their own $0 pool — the prize
    // (if any) comes from that CATEGORY's own banked freeroll fund instead
    // (a separate pool per category, not one shared pool), capped at one
    // per resolved freeroll room so a big bank spreads across occurrences
    // rather than dumping everything into a single room.
    const prizeConfig = FREEROLL_PRIZE_CONFIG[satellite.tier_id];
    const fund = db.prepare("SELECT * FROM freeroll_fund WHERE category_id = ?").get(satellite.tier_id);
    ticketsFunded = fund.prizes_available > 0 ? 1 : 0;
    remainder = 0; // no STONK consolation prize in a freeroll — you get the real prize, a bonus freeroll, or nothing beyond that
    freerollPrizeType = prizeConfig.prizeType; // 'main_event_ticket' | 'runner_entry'
  } else {
    const result = computeLadder(grossPool * (1 - RAKE.total), satellite.ticket_cost);
    ticketsFunded = result.unitsFunded;
    remainder = result.remainder;
  }

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

  if (satellite.price_level === "free" && ticketsFunded === 1) {
    db.prepare("UPDATE freeroll_fund SET prizes_available = prizes_available - 1 WHERE category_id = ?").run(satellite.tier_id);
  }

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

    if (satellite.price_level === "free") {
      // Freeroll rooms only ever have ONE meaningful outcome to hand out,
      // and only to the #1 finisher — either a real prize (funded from
      // this category's own bank) or, if the bank was empty, a bonus
      // freeroll entry into the next occurrence so a legitimate win never
      // comes away with literally nothing. That bonus is a genuine extra
      // — it's inserted directly here, bypassing the normal 1-per-occurrence
      // reservation cap, since it's an awarded prize, not a self-initiated entry.
      if (rank === 1 && ticketsFunded === 1 && freerollPrizeType === "main_event_ticket") {
        prizeType = "ticket";
        db.prepare(
          "INSERT INTO tickets (account_id, source_satellite_id, value_stonk, status) VALUES (?, ?, ?, 'unredeemed')"
        ).run(r.accountId, satellite.id, TICKET_COST);
      } else if (rank === 1 && ticketsFunded === 1 && freerollPrizeType === "runner_entry") {
        prizeType = "runner_entry";
        // Two deliberate redirects, both landing on a SHARED destination
        // instead of that same category's own Runner tier:
        //   Degen Hours -> that day's Race to the Close (built earlier)
        //   Full Day / Morning / Afternoon -> Weekly Qualifier's Runner tier
        // Weekly Qualifier's OWN freeroll never reaches this branch at all
        // — its prizeType is 'main_event_ticket', not 'runner_entry' (see
        // FREEROLL_PRIZE_CONFIG), so it keeps its existing direct,
        // guaranteed-ticket behavior completely unchanged.
        const targetTierId =
          satellite.tier_id === "hourly"
            ? "race_to_close"
            : ["full_day", "morning", "afternoon"].includes(satellite.tier_id)
              ? "weekly_qualifier"
              : satellite.tier_id;
        db.prepare(
          "INSERT INTO pending_allocations (account_id, target_type, target_tier_id, target_price_level, allocations_json, source) VALUES (?, 'satellite', ?, 'runner', ?, 'freeroll_prize')"
        ).run(r.accountId, targetTierId, JSON.stringify([]));
      } else if (rank === 1 && ticketsFunded === 0) {
        prizeType = "bonus_freeroll";
        db.prepare(
          "INSERT INTO pending_allocations (account_id, target_type, target_tier_id, target_price_level, allocations_json, source) VALUES (?, 'satellite', ?, 'free', ?, 'freeroll_bonus')"
        ).run(r.accountId, satellite.tier_id, JSON.stringify([]));
      }
    } else if (rank <= ticketsFunded) {
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

module.exports = {
  start,
  tick,
  TIERS,
  CATEGORIES,
  PRICE_LEVEL_NAMES,
  FREEROLL_SURCHARGE,
  FREEROLL_PRIZE_CONFIG,
};
