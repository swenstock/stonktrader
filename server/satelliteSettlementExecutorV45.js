const db = require('./db');
const custodian = require('./custodian');
const { planPaidSatellite, planFreeroll } = require('./satelliteSettlementPlanV45');
const { issueTicket } = require('./ticketServiceV45');
const freerollReserve = require('./freerollReserveV45');
const { settleEntryRake, money } = require('./rakeV45');
const {
  parseStonkDecimalToSubunits,
  getContestFundingPoolStatus,
  recordContestFundingInTransaction,
  issueWonJuniorFromContestPoolInTransaction,
} = require('./contestJuniorFundingPool');

function toSubunits(stonk) {
  return parseStonkDecimalToSubunits(Number(stonk).toFixed(6));
}
function poolUnallocatedStonk() {
  return Number(getContestFundingPoolStatus(db).unallocatedSubunits) / 1e6;
}
function resultPrizeType(award) {
  if (!award) return 'none';
  if (award.badgeQuantity > 0) return 'jr_broker_badge';
  if (award.isCashPrize) return 'stonk_cash_prize';
  if (award.ticketType) return `${award.ticketType}_tickets`;
  return 'none';
}
function issueAwardTickets(award, satelliteId) {
  const ids = [];
  for (let i = 0; i < award.ticketQuantity; i++) {
    const t = issueTicket({
      accountId: award.accountId,
      ticketType: award.ticketType,
      backingStonk: award.backingPerTicket,
      sourceSatelliteId: satelliteId,
      fundMainEventReserve: false,
    });
    ids.push(t.id);
  }
  return ids;
}
function fundAndIssueBadgeInTransaction({ satelliteId, award, sourceType }) {
  if (award.badgeFundingContribution > 0) {
    recordContestFundingInTransaction(db, {
      fundingId: `${sourceType}:${satelliteId}:rank:${award.rank}:badge-funding`,
      sourceType,
      sourceId: `${satelliteId}:${award.rank}`,
      netPrizeSubunits: toSubunits(award.badgeFundingContribution),
    });
  }
  issueWonJuniorFromContestPoolInTransaction(db, {
    issuanceId: `${sourceType}:${satelliteId}:rank:${award.rank}:jr-broker-badge`,
    accountId: award.accountId,
  });
}
function writeResults({ satellite, ranked, awards, sourceType }) {
  const awardByRank = new Map(awards.map(a => [a.rank, a]));
  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1;
    const r = ranked[i];
    const award = awardByRank.get(rank) || null;
    if (award?.badgeQuantity > 0) fundAndIssueBadgeInTransaction({ satelliteId:satellite.id, award, sourceType });
    if (award?.ticketQuantity > 0) issueAwardTickets(award, satellite.id);
    if (award?.stonkBonus > 0) {
      custodian.credit(r.accountId, award.stonkBonus, 'satellite_prize_stonk_v45', {
        referenceType: 'satellite', referenceId: satellite.id,
      });
    }
    db.prepare(`INSERT INTO satellite_results
      (satellite_id, account_id, entry_id, portfolio_id, rank, pl, prize_type, prize_amount, ticket_type, ticket_quantity, stonk_bonus)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        satellite.id, r.accountId, r.entryId ?? null, r.portfolioId ?? null, rank, Number(r.pl || 0),
        resultPrizeType(award), award?.stonkBonus > 0 ? award.stonkBonus : null,
        award?.ticketType || null, award?.ticketQuantity || null, award?.stonkBonus || 0,
      );
  }
}

function executePaid({ satellite, entries, ranked, stonkUsdPriceMicros = 0 }) {
  const poolAtStart = poolUnallocatedStonk();
  const plan = planPaidSatellite({ priceLevel: satellite.price_level, ranked, poolUnallocatedStonk:poolAtStart });
  db.exec('BEGIN IMMEDIATE');
  try {
    const rake = settleEntryRake(entries, { entryType:'satellite', referenceId:satellite.id });
    if (money(rake.totalRake) !== money(plan.math.rake)) {
      throw new Error(`Rake mismatch: actual ${rake.totalRake}, payout engine ${plan.math.rake}`);
    }

    writeResults({ satellite, ranked, awards: plan.awards, sourceType:'paid_satellite' });

    if (plan.math.carryContribution > 0) {
      recordContestFundingInTransaction(db, {
        fundingId:`paid_satellite:${satellite.id}:carry`,
        sourceType:'paid_satellite_carry',
        sourceId:String(satellite.id),
        netPrizeSubunits:toSubunits(plan.math.carryContribution),
      });
    }

    const ticketCount = plan.awards.reduce((n,a)=>n+(a.ticketQuantity||0),0);
    db.prepare(`UPDATE satellites SET
      status='resolved', resolved_at=?, pool_gross=?, player_pool=?,
      platform_take_stonk=?, affiliate_paid_stonk=?, stonk_usd_price=?,
      tickets_funded=?, remainder_stonk=?, remainder_account_id=NULL,
      remainder_display_name=NULL, settlement_version='v45-badges', settlement_error=NULL
      WHERE id=?`)
      .run(
        new Date().toISOString(), plan.math.contestHandle, plan.math.contestPrizePool,
        rake.platformTake, rake.affiliatePaid, stonkUsdPriceMicros,
        ticketCount, plan.math.carryContribution, satellite.id,
      );
    db.exec('COMMIT');
    return { ...plan, rake, poolAtStart };
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
}

function executeFreeroll({ satellite, ranked, stonkUsdPriceMicros = 0 }) {
  const reserve = freerollReserve.get(satellite.tier_id);
  const reserveBalance = Number(reserve?.balance_stonk || 0);
  const plan = planFreeroll({ ranked, reserveBalance });

  db.exec('BEGIN IMMEDIATE');
  try {
    // Free Roll money stays local until a Badge is actually awarded. Each 40K
    // unit is moved atomically into the canonical Badge reserve, then issued.
    for (const award of plan.awards.filter(a=>a.badgeQuantity>0)) {
      freerollReserve.spend(satellite.tier_id, award.badgeFundingContribution, 'freeroll_badge_funding', {
        referenceType:'satellite', referenceId:satellite.id,
      });
      fundAndIssueBadgeInTransaction({ satelliteId:satellite.id, award, sourceType:'freeroll' });
    }

    const cashTotal = money(plan.awards.reduce((n,a)=>n+(a.stonkBonus||0),0));
    if (cashTotal > 0) {
      freerollReserve.spend(satellite.tier_id, cashTotal, 'freeroll_stonk_prizes', {
        referenceType:'satellite', referenceId:satellite.id,
      });
    }
    // badge funding was already issued above; writeResults must not issue it twice.
    const cashOnlyAwards = plan.awards.map(a=>a.badgeQuantity>0 ? {...a,badgeQuantity:0,badgeFundingContribution:0} : a);
    writeResults({ satellite, ranked, awards: cashOnlyAwards, sourceType:'freeroll' });
    // write Badge result rows explicitly for Badge ranks.
    const badgeRanks = new Set(plan.awards.filter(a=>a.badgeQuantity>0).map(a=>a.rank));
    if (badgeRanks.size) {
      for (const rank of badgeRanks) {
        db.prepare("UPDATE satellite_results SET prize_type='jr_broker_badge' WHERE satellite_id=? AND rank=?").run(satellite.id,rank);
      }
    }

    db.prepare(`UPDATE satellites SET
      status='resolved', resolved_at=?, pool_gross=0, player_pool=0,
      platform_take_stonk=0, affiliate_paid_stonk=0, stonk_usd_price=?,
      tickets_funded=0, remainder_stonk=?, remainder_account_id=NULL,
      remainder_display_name=NULL, settlement_version='v45-badges', settlement_error=NULL
      WHERE id=?`)
      .run(new Date().toISOString(), stonkUsdPriceMicros, plan.math.reserveRemainder, satellite.id);
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
