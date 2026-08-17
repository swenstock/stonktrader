// V45 satellite scheduler/resolver.
// Runs only when PAYOUT_ENGINE_V45=true (selected in server/index.js).
// The legacy scheduler remains untouched for safe rollback.

const db = require('./db');
const { totalValueForPortfolios } = require('./portfolioValue');
const { etDateTime, etCalendarDate, easternParts, isWeekday, currentWeekWindow } = require('./timeHelpers');
const { applyPendingSatelliteAllocations } = require('./allocationEngine');
const { CATEGORIES, PRICE_LEVEL_NAMES, TIERS } = require('./tierConfig');
const { executeSatelliteSettlement } = require('./satelliteSettlementExecutorV45');
const { planPaidSatellite, planFreeroll } = require('./satelliteSettlementPlanV45');
const freerollReserve = require('./freerollReserveV45');
const testClock = require('./testClock');

const TEST_MODE = process.env.TEST_MODE === 'true';
const TEST_SATELLITE_MINUTES = Number(process.env.TEST_SATELLITE_MINUTES) || 3;
const STONK_USD_PRICE_MICROS = () => Math.round(Number(process.env.STONK_USD_PRICE || '0.0346') * 1e6);

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

function degenHoursWindow(now) {
  if (!isWeekday(now)) return null;
  const p = easternParts(now);
  const h = Number(p.hour), m = Number(p.minute);
  const slotHour = m >= 30 ? h : h - 1;
  if (slotHour < 9 || slotHour > 14) return null;
  const { year, month, day } = etCalendarDate(now);
  const opensAt = etDateTime(year, month, day, slotHour, 30, 0);
  return { opensAt, locksAt: new Date(opensAt.getTime() + 60 * 60000) };
}

function windowFor(tier, now) {
  if (TEST_MODE && !testClock.getStatus().overridden) {
    return { opensAt: now, locksAt: new Date(now.getTime() + TEST_SATELLITE_MINUTES * 60000) };
  }
  if (tier.cadence === 'weekly') {
    const { weekStart, weekEnd } = currentWeekWindow(now);
    return { opensAt: weekStart, locksAt: weekEnd };
  }
  if (tier.cadence === 'hourly') return degenHoursWindow(now);
  return dailyWindow(tier, now);
}

function openNewSatellite(tier, now) {
  const window = windowFor(tier, now);
  if (!window) return null;
  const { opensAt, locksAt } = window;
  const info = db.prepare(`INSERT INTO satellites
    (tier_id, price_level, name, entry_fee, ticket_cost, opens_at, locks_at, status, settlement_version)
    VALUES (?, ?, ?, ?, 3000, ?, ?, 'open', 'v45')`)
    .run(tier.categoryId, tier.priceLevel, tier.name, tier.poolFee, opensAt.toISOString(), locksAt.toISOString());
  const sat = db.prepare('SELECT * FROM satellites WHERE id=?').get(info.lastInsertRowid);
  applyPendingSatelliteAllocations(sat);
  return sat;
}

function ensureOpenSatellites(now = testClock.getNow()) {
  const testBypass = TEST_MODE && !testClock.getStatus().overridden;
  for (const tier of TIERS) {
    if (testBypass) {
      const open = db.prepare("SELECT id FROM satellites WHERE tier_id=? AND price_level=? AND status='open'").get(tier.categoryId,tier.priceLevel);
      if (!open) openNewSatellite(tier, now);
      continue;
    }
    if ((tier.cadence === 'daily' || tier.cadence === 'hourly') && !isWeekday(now)) continue;
    const win = windowFor(tier, now);
    if (!win || now.getTime() < win.opensAt.getTime()) continue;
    const existing = db.prepare('SELECT id FROM satellites WHERE tier_id=? AND price_level=? AND opens_at=?')
      .get(tier.categoryId,tier.priceLevel,win.opensAt.toISOString());
    if (!existing) openNewSatellite(tier, now);
  }
}

function rankSatellite(satellite) {
  const entries = db.prepare('SELECT * FROM satellite_entries WHERE satellite_id=?').all(satellite.id);
  if (!entries.length) return { entries, ranked: [] };
  const values = totalValueForPortfolios(entries.map(e=>e.portfolio_id));
  const ranked = entries.map(e=>({
    accountId:e.account_id,
    entryId:e.id,
    portfolioId:e.portfolio_id,
    pl:(values[e.portfolio_id] ?? 100000)-100000,
  })).sort((a,b)=>b.pl-a.pl || a.entryId-b.entryId);
  return { entries, ranked };
}

function blockSettlement(satellite, code, message) {
  db.prepare("UPDATE satellites SET status='blocked', settlement_version='v45', settlement_error=? WHERE id=?")
    .run(`${code}: ${message}`, satellite.id);
  return { status:'blocked', code, message };
}

function resolveSatellite(satellite) {
  const { entries, ranked } = rankSatellite(satellite);
  if (!entries.length) {
    db.prepare("UPDATE satellites SET status='resolved', resolved_at=?, pool_gross=0, player_pool=0, platform_take_stonk=0, affiliate_paid_stonk=0, tickets_funded=0, remainder_stonk=0, settlement_version='v45', settlement_error=NULL WHERE id=?")
      .run(new Date().toISOString(), satellite.id);
    return { status:'empty' };
  }

  // Preflight without side effects so an unfunded promise can never partially settle.
  const preflight = satellite.price_level === 'free'
    ? planFreeroll({ ranked, reserveBalance:Number(freerollReserve.get(satellite.tier_id)?.balance_stonk || 0) })
    : planPaidSatellite({ priceLevel:satellite.price_level, ranked });

  if (preflight.status !== 'OK') {
    return blockSettlement(satellite, preflight.status, preflight.status === 'FREEROLL_RESERVE_UNDERFUNDED'
      ? `reserve ${preflight.reserveBalance}, required ${preflight.required}`
      : `field ${preflight.fieldSize}, minimum funded field ${preflight.minimumFundedField}`);
  }

  return executeSatelliteSettlement({
    satellite,
    entries,
    ranked,
    stonkUsdPriceMicros:STONK_USD_PRICE_MICROS(),
  });
}

function tick(now = testClock.getNow()) {
  ensureOpenSatellites(now);
  const open = db.prepare("SELECT * FROM satellites WHERE status='open'").all();
  for (const sat of open) {
    if (new Date(sat.locks_at).getTime() <= now.getTime()) {
      try { resolveSatellite(sat); }
      catch (err) { blockSettlement(sat, err.code || 'SETTLEMENT_ERROR', err.message); }
    }
  }
}

function start() {
  tick();
  const interval = setInterval(()=>tick(),15000);
  interval.unref?.();
}

module.exports = {
  start, tick, resolveSatellite, ensureOpenSatellites,
  TIERS, CATEGORIES, PRICE_LEVEL_NAMES,
  engineVersion:'v45',
};
