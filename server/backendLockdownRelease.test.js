'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const {
  computePaidContest,
  computeFreerollPlan,
} = require('./payoutEngineV2');
const { EXCHANGE_FEE_PCT } = require('./economicsPolicyV45');
const {
  SOURCE_WON,
  issueFundedJuniorBrokerShare,
  redeemJuniorsForActivatedBroker,
} = require('./juniorBrokerStage2');
const { getPlayerJuniorSnapshot } = require('./juniorBrokerStage4');
const {
  reserveListedQuantity,
  getHoldingReservation,
} = require('./badgeQuantityLockV45');

// 1) Carry bug: execute the real payout planner against the exact failure shape.
{
  const eighty = computePaidContest({ tierKey:'clerk', fieldSize:20, poolUnallocatedStonk:80000 });
  assert.strictEqual(eighty.paidPlaces, 2);
  assert.strictEqual(eighty.badgesAwarded, 2, '80K carry must fund two Badges when two protected places exist');
  assert.deepStrictEqual(eighty.payouts.map(p=>p.award), ['jr_broker_badge','jr_broker_badge']);

  const oneTwenty = computePaidContest({ tierKey:'clerk', fieldSize:30, poolUnallocatedStonk:120000 });
  assert.strictEqual(oneTwenty.paidPlaces, 3);
  assert.strictEqual(oneTwenty.badgesAwarded, 3, '120K carry must fund three Badges when three protected places exist');

  const boundary = computePaidContest({ tierKey:'clerk', fieldSize:20, poolUnallocatedStonk:39999 });
  assert.strictEqual(boundary.badgesAwarded, 1);
  assert.strictEqual(boundary.payouts[0].badgeFundingContribution, 1, '39,999 carry still needs 1 STONK from current contest');
}

// Product decision after the audit: Free Roll residual rolls forward, never pays cash.
{
  const free = computeFreerollPlan({ fieldSize:100, reserveBalance:45500 });
  assert.strictEqual(free.badgesAwarded, 1);
  assert.strictEqual(free.badgeSpend, 40000);
  assert.strictEqual(free.cashDistributed, 0);
  assert.strictEqual(free.reserveRemainder, 5500);
  assert.strictEqual(free.payouts.length, 1);
}

// 2) Fee is a canonical business rule, not environment-dependent.
{
  const previous = process.env.TICKET_MARKET_FEE_PCT;
  delete process.env.TICKET_MARKET_FEE_PCT;
  delete require.cache[require.resolve('./economicsPolicyV45')];
  const fresh = require('./economicsPolicyV45');
  assert.strictEqual(fresh.EXCHANGE_FEE_PCT, 0.05);
  assert.strictEqual(EXCHANGE_FEE_PCT, 0.05);
  if (previous === undefined) delete process.env.TICKET_MARKET_FEE_PCT;
  else process.env.TICKET_MARKET_FEE_PCT = previous;
}

// 5) Promotion must use available (total - listed) Badge inventory.
{
  const db = new DatabaseSync(':memory:', { readBigInts:true });
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE accounts(id INTEGER PRIMARY KEY); INSERT INTO accounts(id) VALUES(1);');
  for (let i=1; i<=20; i++) issueFundedJuniorBrokerShare(db, { issuanceId:`lockdown-junior-${i}`, accountId:1, source:SOURCE_WON });
  reserveListedQuantity(db, { accountId:1, assetType:'junior_broker_share', quantity:1n });

  const before = getPlayerJuniorSnapshot(db, 1);
  assert.strictEqual(before.count, 20);
  assert.strictEqual(before.listed, 1);
  assert.strictEqual(before.available, 19);
  assert.strictEqual(before.redeemable, false);
  assert.throws(
    () => redeemJuniorsForActivatedBroker(db, { redemptionId:'lockdown-listed-reject', accountId:1 }),
    err => err && err.code === 'JUNIORS_LISTED' && err.listedUnits === 1n
  );
  { const h=getHoldingReservation(db,1,'junior_broker_share'); assert.strictEqual(h.quantity,20n); assert.strictEqual(h.quantity_listed,1n); }

  issueFundedJuniorBrokerShare(db, { issuanceId:'lockdown-junior-21', accountId:1, source:SOURCE_WON });
  const eligible = getPlayerJuniorSnapshot(db, 1);
  assert.strictEqual(eligible.count, 21);
  assert.strictEqual(eligible.listed, 1);
  assert.strictEqual(eligible.available, 20);
  assert.strictEqual(eligible.redeemable, true);
  redeemJuniorsForActivatedBroker(db, { redemptionId:'lockdown-available-20', accountId:1 });
  { const h=getHoldingReservation(db,1,'junior_broker_share'); assert.strictEqual(h.quantity,1n); assert.strictEqual(h.quantity_listed,1n,'listed Badge must survive promotion untouched'); }
  db.close();
}

// 3) Real DB retirement migration: cash entries refund, applied tickets restore,
// stale pending Main Event allocations fail, and scheduler tick cannot create one.
{
  const dbPath = `/tmp/sbc-backend-lockdown-${process.pid}.db`;
  try { fs.unlinkSync(dbPath); } catch (_) {}
  const script = String.raw`
    process.env.DB_PATH=${JSON.stringify(dbPath)};
    process.env.SESSION_SECRET='backend-lockdown-secret';
    const assert=require('assert');
    const db=require('./server/db');
    require('./server/schemaV45').run();
    const mk=(email,name,code,balance)=>{const u=Number(db.prepare('INSERT INTO users(email,password_hash,display_name,referral_code) VALUES(?,?,?,?)').run(email,'x:y',name,code).lastInsertRowid);return Number(db.prepare('INSERT INTO accounts(user_id,stonk_balance) VALUES(?,?)').run(u,balance).lastInsertRowid)};
    const a=mk('a@lockdown.test','A','LOCKA',1000), b=mk('b@lockdown.test','B','LOCKB',1000);
    const p1=Number(db.prepare('INSERT INTO portfolios(account_id,label,cash_balance) VALUES(?,?,100000)').run(a,'legacy cash').lastInsertRowid);
    const p2=Number(db.prepare('INSERT INTO portfolios(account_id,label,cash_balance) VALUES(?,?,100000)').run(b,'legacy ticket').lastInsertRowid);
    const c=Number(db.prepare("INSERT INTO contests(week_start,week_end,entry_fee,broker_unit_cost,status) VALUES('2026-08-24','2026-08-28',3000,733332,'open')").run().lastInsertRowid);
    const t=Number(db.prepare("INSERT INTO tickets(account_id,value_stonk,status,applied_to_contest_id) VALUES(?,3000,'applied',?)").run(b,c).lastInsertRowid);
    db.prepare('INSERT INTO contest_entries(contest_id,account_id,portfolio_id,entry_fee_paid) VALUES(?,?,?,3000)').run(c,a,p1);
    db.prepare('INSERT INTO contest_entries(contest_id,account_id,portfolio_id,entry_fee_paid,paid_with_ticket_id) VALUES(?,?,?,3000,?)').run(c,b,p2,t);
    db.prepare("INSERT INTO pending_allocations(account_id,target_type,target_tier_id,allocations_json,status) VALUES(?,'contest','main_event','[]','pending')").run(a);
    const before=Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(a).stonk_balance);
    const out=require('./server/mainEventRetirementV45').retireOpenMainEvents();
    assert.strictEqual(out.contestsRetired,1); assert.strictEqual(out.cashRefundedStonk,3000); assert.strictEqual(out.ticketsRestored,1); assert.strictEqual(out.pendingAllocationsFailed,1);
    assert.strictEqual(Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(a).stonk_balance)-before,3000);
    assert.strictEqual(db.prepare('SELECT status FROM contests WHERE id=?').get(c).status,'retired');
    const ticket=db.prepare('SELECT status,applied_to_contest_id FROM tickets WHERE id=?').get(t); assert.strictEqual(ticket.status,'unredeemed'); assert.strictEqual(ticket.applied_to_contest_id,null);
    assert.strictEqual(db.prepare('SELECT status FROM pending_allocations WHERE target_tier_id=\'main_event\'').get().status,'failed');
    const second=require('./server/mainEventRetirementV45').retireOpenMainEvents(); assert.strictEqual(second.contestsRetired,0); assert.strictEqual(second.cashRefundedStonk,0); assert.strictEqual(second.ticketsRestored,0);
    const scheduler=require('./server/contestScheduler'); assert.deepStrictEqual(scheduler.tick(),{retired:true});
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM contests WHERE status='open'").get().n,0);
  `;
  execFileSync(process.execPath, ['-e', script], { cwd:path.join(__dirname,'..'), stdio:'pipe' });
  try { fs.unlinkSync(dbPath); } catch (_) {}
  try { fs.unlinkSync(`${dbPath}-wal`); } catch (_) {}
  try { fs.unlinkSync(`${dbPath}-shm`); } catch (_) {}
}

console.log('Backend Lockdown Release: PASS');
console.log('Carry: 80K -> 2 Badges; 120K -> 3; 39,999 still needs 1 STONK from contest');
console.log('Free Roll: 45,500 -> 1 Badge + 5,500 carried forward; zero residual cash');
console.log('Exchange: canonical 5% fee survives missing TICKET_MARKET_FEE_PCT');
console.log('Promotion: 20 owned / 1 listed rejected cleanly; 21 owned / 1 listed promotes using 20 available');
console.log('Main Event: stale open cash refunded, ticket restored, pending allocation failed, scheduler tick remains retired');
