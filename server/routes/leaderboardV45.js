const express = require('express');
const router = express.Router();
const db = require('../db');
const { totalValueForPortfolios } = require('../portfolioValue');
const { getBrokerRaceStats } = require('../juniorBrokerRace');

function optionalAccountId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const { verify } = require('../auth');
  const payload = verify(header.slice(7));
  if (!payload || !payload.userId || !payload.email) return null;
  const user = db.prepare('SELECT id, email FROM users WHERE id=?').get(payload.userId);
  if (!user || String(user.email || '').toLowerCase() !== String(payload.email || '').toLowerCase()) return null;
  return db.prepare('SELECT id FROM accounts WHERE user_id=?').get(payload.userId)?.id || null;
}

function summarize(rows, accountId, source) {
  const fieldSize = rows.length;
  const isFreeroll = source?.type === 'satellite' && source?.priceLevel === 'free';
  const paidPlaces = isFreeroll ? 0 : (fieldSize ? Math.max(1, Math.ceil(fieldSize * 0.10)) : 0);
  const moneyLine = paidPlaces ? rows[paidPlaces - 1] : null;
  const enriched = rows.map(r => {
    const actualFreePrize = isFreeroll && r.prizeType && r.prizeType !== 'none';
    return {
      ...r,
      isPrizeZone: isFreeroll ? !!actualFreePrize : (paidPlaces > 0 && r.rank <= paidPlaces),
      isMoneyLine: isFreeroll ? false : (paidPlaces > 0 && r.rank === paidPlaces),
      isMine: accountId != null && r.accountId === accountId,
    };
  });
  const mine = enriched.filter(r => r.isMine);
  const best = mine[0] || null;
  let userPosition = null;
  if (best) {
    const inside = isFreeroll ? !!best.isPrizeZone : best.rank <= paidPlaces;
    userPosition = {
      bestRank: best.rank,
      fieldSize,
      paidPlaces,
      insidePrizeZone: inside,
      spotsInside: isFreeroll ? null : (inside ? paidPlaces - best.rank : 0),
      spotsToMoney: isFreeroll ? null : (inside ? 0 : best.rank - paidPlaces),
      pnlGapToMoney: isFreeroll ? null : (moneyLine ? Number((moneyLine.pl - best.pl).toFixed(2)) : null),
      pnlCushion: isFreeroll ? null : (moneyLine && inside ? Number((best.pl - moneyLine.pl).toFixed(2)) : 0),
      entryCount: mine.length,
    };
  }
  return {
    source,
    fieldSize,
    paidPlaces,
    moneyLineRank: paidPlaces || null,
    moneyLinePL: moneyLine?.pl ?? null,
    userPosition,
    myEntries: mine,
    rows: enriched,
  };
}

function openSatelliteRows(satelliteId) {
  const entries = db.prepare(`SELECT satellite_entries.id AS entry_id,
      satellite_entries.portfolio_id, satellite_entries.account_id, users.display_name
    FROM satellite_entries
    JOIN accounts ON accounts.id=satellite_entries.account_id
    JOIN users ON users.id=accounts.user_id
    WHERE satellite_entries.satellite_id=?`).all(satelliteId);
  const values = totalValueForPortfolios(entries.map(e => e.portfolio_id));
  return entries.map(e => ({
    entryId:e.entry_id,
    portfolioId:e.portfolio_id,
    accountId:e.account_id,
    displayName:e.display_name,
    pl:Number(((values[e.portfolio_id] ?? 100000)-100000).toFixed(2)),
  })).sort((a,b)=>b.pl-a.pl || a.entryId-b.entryId)
    .map((r,i)=>({rank:i+1,...r}));
}

function resolvedSatelliteRows(satelliteId) {
  return db.prepare(`SELECT satellite_results.rank, satellite_results.pl,
      satellite_results.prize_type AS prizeType, satellite_results.prize_amount AS prizeAmount,
      satellite_results.ticket_type AS ticketType, satellite_results.ticket_quantity AS ticketQuantity,
      satellite_results.stonk_bonus AS stonkBonus, satellite_results.entry_id AS entryId,
      satellite_results.portfolio_id AS portfolioId,
      satellite_results.account_id AS accountId, users.display_name AS displayName
    FROM satellite_results
    JOIN accounts ON accounts.id=satellite_results.account_id
    JOIN users ON users.id=accounts.user_id
    WHERE satellite_results.satellite_id=? ORDER BY satellite_results.rank ASC`).all(satelliteId)
    .map(r=>({...r,pl:Number(r.pl||0)}));
}

router.get('/satellite/:id', (req,res) => {
  const satellite = db.prepare('SELECT * FROM satellites WHERE id=?').get(req.params.id);
  if (!satellite) return res.status(404).json({error:'Satellite not found'});
  const accountId = optionalAccountId(req);
  const rows = satellite.status === 'resolved' ? resolvedSatelliteRows(satellite.id) : openSatelliteRows(satellite.id);
  res.json(summarize(rows, accountId, {
    type:'satellite', id:satellite.id, name:satellite.name, status:satellite.status,
    tierId:satellite.tier_id, priceLevel:satellite.price_level,
    opensAt:satellite.opens_at, locksAt:satellite.locks_at,
    settlementVersion:satellite.settlement_version || 'legacy',
    settlementError:satellite.settlement_error || null,
  }));
});

function openContestRows(contestId) {
  const entries = db.prepare(`SELECT contest_entries.id AS entry_id,
      contest_entries.portfolio_id, contest_entries.account_id, users.display_name
    FROM contest_entries JOIN accounts ON accounts.id=contest_entries.account_id
    JOIN users ON users.id=accounts.user_id WHERE contest_entries.contest_id=?`).all(contestId);
  const values=totalValueForPortfolios(entries.map(e=>e.portfolio_id));
  return entries.map(e=>({entryId:e.entry_id,portfolioId:e.portfolio_id,accountId:e.account_id,displayName:e.display_name,pl:Number(((values[e.portfolio_id]??100000)-100000).toFixed(2))}))
    .sort((a,b)=>b.pl-a.pl||a.entryId-b.entryId).map((r,i)=>({rank:i+1,...r}));
}

function resolvedContestRows(contestId) {
  return db.prepare(`SELECT contest_results.rank, contest_results.pl,
      contest_results.prize_type AS prizeType, contest_results.prize_amount AS prizeAmount,
      contest_results.account_id AS accountId, users.display_name AS displayName
    FROM contest_results JOIN accounts ON accounts.id=contest_results.account_id
    JOIN users ON users.id=accounts.user_id WHERE contest_results.contest_id=? ORDER BY contest_results.rank`).all(contestId)
    .map(r=>({...r,pl:Number(r.pl||0),entryId:null,portfolioId:null}));
}

router.get('/contest/:id', (req,res) => {
  const contest=db.prepare('SELECT * FROM contests WHERE id=?').get(req.params.id);
  if(!contest)return res.status(404).json({error:'Contest not found'});
  const accountId=optionalAccountId(req);
  if (contest.status !== 'resolved') return res.status(410).json({code:'MAIN_EVENT_RETIRED',error:'Main Event is retired; only resolved historical results remain readable'});
  const rows=resolvedContestRows(contest.id);
  res.json(summarize(rows,accountId,{type:'historical_contest',id:contest.id,name:'Historical Main Event',status:contest.status,opensAt:contest.week_start,locksAt:contest.week_end}));
});

router.get('/sources', (req,res) => {
  const satellites=db.prepare(`SELECT satellites.id, satellites.name, satellites.status,
      satellites.tier_id AS tierId, satellites.price_level AS priceLevel,
      satellites.opens_at AS opensAt, satellites.locks_at AS locksAt,
      satellites.settlement_error AS settlementError,
      (SELECT COUNT(*) FROM satellite_entries WHERE satellite_id=satellites.id) AS fieldSize
    FROM satellites WHERE satellites.status IN ('open','resolved','blocked')
    ORDER BY CASE satellites.status WHEN 'open' THEN 0 WHEN 'blocked' THEN 1 ELSE 2 END,
      COALESCE(satellites.resolved_at,satellites.locks_at) DESC LIMIT 100`).all();
  res.json({
    contests: [],
    satellites:satellites.map(s=>({...s,type:'satellite'})),
  });
});

router.get('/broker-race', (req,res) => {
  try {
    const raw = Number(req.query.limit || 50);
    const limit = Number.isSafeInteger(raw) ? Math.max(1, Math.min(100, raw)) : 50;
    res.json(getBrokerRaceStats(db, { limit }));
  } catch (err) {
    console.error('Broker Race leaderboard failed', err);
    res.status(500).json({error:'Unable to load Broker Race'});
  }
});

module.exports=router;
module.exports.optionalAccountId=optionalAccountId;
module.exports.summarize=summarize;
