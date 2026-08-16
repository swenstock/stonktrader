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

// Runner requires three players to fund top-10% baseline (two Runner tickets).
const blocked=sat('runner','full_day',100);
entrants(blocked,2,100);
const b=scheduler.resolveSatellite(blocked);
if(b.status!=='blocked'||b.code!=='UNDERFUNDED_BASELINE') throw new Error(`Expected blocked Runner field, got ${JSON.stringify(b)}`);
const blockedRow=db.prepare('SELECT * FROM satellites WHERE id=?').get(blocked.id);
if(blockedRow.status!=='blocked'||!String(blockedRow.settlement_error).includes('minimum funded field 3')) throw new Error('Blocked room did not persist explicit reason');
if(db.prepare('SELECT COUNT(*) n FROM satellite_results WHERE satellite_id=?').get(blocked.id).n!==0) throw new Error('Blocked room wrote prizes/results');

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

// Separate funded freeroll after adding exact reserve liability.
const free2=sat('free','afternoon',0);
entrants(free2,10,0);
freerollReserve.deposit('afternoon',200,{referenceType:'test',referenceId:free2.id});
const freeFunded=scheduler.resolveSatellite(free2);
if(freeFunded.status!=='OK') throw new Error('Funded freeroll did not resolve');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='runner'").get(free2.id).n!==2) throw new Error('10-player freeroll should award two Runner tickets to top 10%');

console.log('satelliteSchedulerV45 tests passed');
