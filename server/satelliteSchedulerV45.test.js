const fs = require('fs');
const path = '/tmp/sbc-scheduler-v45-test.db';
try { fs.unlinkSync(path); } catch (_) {}
process.env.DB_PATH = path;
process.env.TEST_MODE = 'true';

const db = require('./db');
require('./schemaV45').run();
const freerollReserve = require('./freerollReserveV45');
const scheduler = require('./satelliteSchedulerV45');

const userId = db.prepare("INSERT INTO users (email,password_hash,display_name,referral_code) VALUES ('sched@test.local','x:y','Sched','SCH001')").run().lastInsertRowid;
const accountId = db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(userId).lastInsertRowid;

function sat(priceLevel,tierId='full_day',entryFee=100){
  return db.prepare(`INSERT INTO satellites
    (tier_id,price_level,name,entry_fee,ticket_cost,opens_at,locks_at,status,settlement_version)
    VALUES (?,?,?,?,3000,?,?, 'open','v45') RETURNING *`)
    .get(tierId,priceLevel,`${tierId}-${priceLevel}`,entryFee,new Date().toISOString(),new Date(Date.now()+1000).toISOString());
}
function entrants(s,n,fee){
  for(let i=0;i<n;i++){
    const p=db.prepare('INSERT INTO portfolios (account_id,label) VALUES (?,?)').run(accountId,`S-${s.id}-${i}`).lastInsertRowid;
    db.prepare('INSERT INTO satellite_entries (satellite_id,account_id,portfolio_id,entry_fee_paid) VALUES (?,?,?,?)').run(s.id,accountId,p,fee);
  }
}

// A 2-player Runner room cannot fund two Runner tickets. It should no longer
// become permanently blocked: rank 1 receives the 170-STONK net prize pool.
const thin=sat('runner','full_day',100);
entrants(thin,2,100);
const balanceBefore=Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(accountId).stonk_balance);
const r=scheduler.resolveSatellite(thin);
if(r.status!=='OK') throw new Error(`Expected thin Runner field to resolve OK, got ${JSON.stringify(r)}`);
const thinRow=db.prepare('SELECT * FROM satellites WHERE id=?').get(thin.id);
if(thinRow.status!=='resolved'||thinRow.settlement_version!=='v45') throw new Error('Thin room did not resolve through V45');
const results=db.prepare('SELECT * FROM satellite_results WHERE satellite_id=? ORDER BY rank').all(thin.id);
if(results.length!==2) throw new Error(`Expected 2 result rows, got ${results.length}`);
if(results[0].prize_type!=='stonk_cash_prize'||Number(results[0].stonk_bonus)!==170) throw new Error(`Expected rank 1 170-STONK cash prize, got ${JSON.stringify(results[0])}`);
if(results[1].prize_type!=='none') throw new Error(`Expected rank 2 to get nothing, got ${JSON.stringify(results[1])}`);
const balanceAfter=Number(db.prepare('SELECT stonk_balance FROM accounts WHERE id=?').get(accountId).stonk_balance);
if(balanceAfter-balanceBefore!==170) throw new Error(`Expected 170 STONK credited, actual delta ${balanceAfter-balanceBefore}`);
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=?").get(thin.id).n!==0) throw new Error('Thin cash-prize room should not issue tickets');

const funded=sat('runner','morning',100);
entrants(funded,3,100);
const f=scheduler.resolveSatellite(funded);
if(f.status!=='OK') throw new Error(`Funded Runner field failed: ${JSON.stringify(f)}`);
const fundedRow=db.prepare('SELECT * FROM satellites WHERE id=?').get(funded.id);
if(fundedRow.status!=='resolved'||fundedRow.settlement_version!=='v45') throw new Error('Funded room did not resolve through V45');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='runner'").get(funded.id).n!==2) throw new Error('Funded Runner field should award two Runner tickets');

const free=sat('free','afternoon',0);
entrants(free,10,0);
let freeBlocked=scheduler.resolveSatellite(free);
if(freeBlocked.status!=='blocked'||freeBlocked.code!=='FREEROLL_RESERVE_UNDERFUNDED') throw new Error('Unfunded freeroll was not blocked');

const free2=sat('free','afternoon',0);
entrants(free2,10,0);
freerollReserve.deposit('afternoon',200,{referenceType:'test',referenceId:free2.id});
const freeFunded=scheduler.resolveSatellite(free2);
if(freeFunded.status!=='OK') throw new Error('Funded freeroll did not resolve');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='runner'").get(free2.id).n!==2) throw new Error('10-player freeroll should award two Runner tickets to top 10%');

console.log('satelliteSchedulerV45 tests passed');
