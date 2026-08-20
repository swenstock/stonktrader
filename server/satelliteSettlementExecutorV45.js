const db = require('./db');
const custodian = require('./custodian');
const { planPaidSatellite, planFreeroll } = require('./satelliteSettlementPlanV45');
const { issueTicket } = require('./ticketServiceV45');
const freerollReserve = require('./freerollReserveV45');
const { settleEntryRake, money } = require('./rakeV45');

function resultPrizeType(award) {
  if (!award) return 'none';
  if (award.isCashPrize) return 'stonk_cash_prize';
  if (award.ticketType === 'main_event') return 'main_event_ticket';
  return `${award.ticketType}_tickets`;
}

function issueAwardTickets(award, satelliteId) {
  const ids = [];
  for (let i = 0; i < award.ticketQuantity; i++) {
    const t = issueTicket({
      accountId: award.accountId,
      ticketType: award.ticketType,
      backingStonk: award.backingPerTicket,
      sourceSatelliteId: satelliteId,
      fundMainEventReserve: award.ticketType === 'main_event',
    });
    ids.push(t.id);
  }
  return ids;
}

function writeResults({ satellite, ranked, awards }) {
  const awardByRank = new Map(awards.map(a => [a.rank, a]));
  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1;
    const r = ranked[i];
    const award = awardByRank.get(rank) || null;
    if (award) issueAwardTickets(award, satellite.id);
    if (award?.stonkBonus > 0) {
      custodian.credit(r.accountId, award.stonkBonus, 'satellite_prize_stonk_v45', {
        referenceType: 'satellite', referenceId: satellite.id,
      });
    }
    db.prepare(`INSERT INTO satellite_results
      (satellite_id, account_id, entry_id, portfolio_id, rank, pl, prize_type, prize_amount, ticket_type, ticket_quantity, stonk_bonus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        satellite.id,
        r.accountId,
        r.entryId ?? null,
        r.portfolioId ?? null,
        rank,
        Number(r.pl || 0),
        resultPrizeType(award),
        award?.stonkBonus > 0 ? award.stonkBonus : null,
        award?.ticketType || null,
        award?.ticketQuantity || null,
        award?.stonkBonus || 0,
      );
  }
}

function executePaid({ satellite, entries, ranked, stonkUsdPriceMicros = 0 }) {
  const plan = planPaidSatellite({ priceLevel: satellite.price_level, ranked });
  if (plan.status !== 'OK') {
    const err = new Error(`V45 paid settlement blocked: ${plan.status}; shortfall ${plan.shortfall || 0}`);
    err.code = plan.status;
    err.plan = plan;
    throw err;
  }

  db.exec('BEGIN');
  try {
    const rake = settleEntryRake(entries, { entryType:'satellite', referenceId:satellite.id });
    if (money(rake.totalRake) !== money(plan.math.rake)) {
      throw new Error(`Rake mismatch: actual ${rake.totalRake}, payout engine ${plan.math.rake}`);
    }

    writeResults({ satellite, ranked, awards: plan.awards });

    db.prepare(`UPDATE satellites SET
      status='resolved', resolved_at=?, pool_gross=?, player_pool=?,
      platform_take_stonk=?, affiliate_paid_stonk=?, stonk_usd_price=?,
      tickets_funded=?, remainder_stonk=?, remainder_account_id=NULL,
      remainder_display_name=NULL, settlement_version='v45', settlement_error=NULL
      WHERE id=?`)
      .run(
        new Date().toISOString(),
        plan.math.contestHandle,
        plan.math.contestPrizePool,
        rake.platformTake,
        rake.affiliatePaid,
        stonkUsdPriceMicros,
        plan.math.mainEventTickets,
        plan.math.residualBonuses,
        satellite.id,
      );
    db.exec('COMMIT');
    return { ...plan, rake };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

function executeFreeroll({ satellite, ranked, stonkUsdPriceMicros = 0 }) {
  const reserve = freerollReserve.get(satellite.tier_id);
  const reserveBalance = Number(reserve?.balance_stonk || 0);
  const plan = planFreeroll({ ranked, reserveBalance });
  if (plan.status !== 'OK') {
    const err = new Error(`V45 freeroll settlement blocked: reserve needs ${plan.required}, has ${reserveBalance}`);
    err.code = plan.status;
    err.plan = plan;
    throw err;
  }

  db.exec('BEGIN');
  try {
    freerollReserve.spend(satellite.tier_id, plan.reserveSpend, 'freeroll_ticket_backing', {
      referenceType:'satellite', referenceId:satellite.id,
    });
    writeResults({ satellite, ranked, awards: plan.awards });
    db.prepare(`UPDATE satellites SET
      status='resolved', resolved_at=?, pool_gross=0, player_pool=0,
      platform_take_stonk=0, affiliate_paid_stonk=0, stonk_usd_price=?,
      tickets_funded=0, remainder_stonk=0, remainder_account_id=NULL,
      remainder_display_name=NULL, settlement_version='v45', settlement_error=NULL
      WHERE id=?`)
      .run(new Date().toISOString(), stonkUsdPriceMicros, satellite.id);
    db.exec('COMMIT');
    return plan;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

function executeSatelliteSettlement(args) {
  if (!args?.satellite) throw new Error('satellite required');
  return args.satellite.price_level === 'free' ? executeFreeroll(args) : executePaid(args);
}

module.exports = { executePaid, executeFreeroll, executeSatelliteSettlement };
