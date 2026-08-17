const fs = require('fs');
const path = '/tmp/sbc-settlement-executor-v45.db';
try { fs.unlinkSync(path); } catch (_) {}
process.env.DB_PATH = path;

const db = require('./db');
require('./schemaV45').run();
const reserveLedger = require('./reserveLedger');
const freerollReserve = require('./freerollReserveV45');
const { executePaid, executeFreeroll } = require('./satelliteSettlementExecutorV45');

const userId = db.prepare("INSERT INTO users (email,password_hash,display_name,referral_code) VALUES ('settle@test.local','x:y','Settle','SET001')").run().lastInsertRowid;
const accountId = db.prepare('INSERT INTO accounts (user_id) VALUES (?)').run(userId).lastInsertRowid;

function satellite(priceLevel, tierId='morning', entryFee=350) {
  return db.prepare(`INSERT INTO satellites
    (tier_id,price_level,name,entry_fee,ticket_cost,opens_at,locks_at,status)
    VALUES (?,?,?,?,3000,?,?, 'open') RETURNING *`)
    .get(tierId,priceLevel,`${tierId}-${priceLevel}`,entryFee,new Date().toISOString(),new Date(Date.now()+1000).toISOString());
}
function buildEntries(sat, n, fee) {
  const entries=[]; const ranked=[];
  for(let i=0;i<n;i++){
    const p=db.prepare('INSERT INTO portfolios (account_id,label) VALUES (?,?)').run(accountId,`P-${sat.id}-${i}`).lastInsertRowid;
    const e=db.prepare('INSERT INTO satellite_entries (satellite_id,account_id,portfolio_id,entry_fee_paid) VALUES (?,?,?,?)').run(sat.id,accountId,p,fee).lastInsertRowid;
    entries.push({id:e,account_id:accountId,entry_fee_paid:fee,portfolio_id:p});
    ranked.push({accountId,entryId:e,pl:n-i});
  }
  return {entries,ranked};
}

// ---- 100-player Trader field ----
const paidSat=satellite('mid','morning',350);
const paid=buildEntries(paidSat,100,350);
const paidOut=executePaid({satellite:paidSat,entries:paid.entries,ranked:paid.ranked,stonkUsdPriceMicros:24000});
if(paidOut.math.paidPlaces!==10) throw new Error('Expected 10 paid places');
if(paidOut.math.mainEventTickets!==9) throw new Error(`Expected 9 ME upgrades, got ${paidOut.math.mainEventTickets}`);
if(paidOut.rake.totalRake!==5250) throw new Error(`Expected exact 5250 rake, got ${paidOut.rake.totalRake}`);
const paidRow=db.prepare('SELECT * FROM satellites WHERE id=?').get(paidSat.id);
if(paidRow.status!=='resolved'||paidRow.settlement_version!=='v45') throw new Error('Paid satellite not marked V45 resolved');
if(db.prepare('SELECT COUNT(*) n FROM satellite_results WHERE satellite_id=?').get(paidSat.id).n!==100) throw new Error('Missing paid result rows');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='main_event'").get(paidSat.id).n!==9) throw new Error('ME ticket count mismatch');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='clerk'").get(paidSat.id).n!==2) throw new Error('Clerk baseline ticket count mismatch');
if(reserveLedger.balance('main_event_reserve')!==27000) throw new Error('Main Event reserve mismatch');
if(reserveLedger.balance('ticket_liability')!==27400) throw new Error(`Ticket liability mismatch ${reserveLedger.balance('ticket_liability')}`);
if(reserveLedger.balance('platform_revenue')!==5250) throw new Error('Platform revenue mismatch');
const creditedBonus=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger_entries WHERE reason='satellite_prize_stonk_v45'").get().n;
if(Number(creditedBonus)!==2350) throw new Error(`Residual bonuses mismatch ${creditedBonus}`);

// ---- Underfunded Runner field: NO writes ----
const tiny=satellite('runner','full_day',100);
const tinyData=buildEntries(tiny,2,100);
let blocked=false;
try{executePaid({satellite:tiny,entries:tinyData.entries,ranked:tinyData.ranked});}catch(e){blocked=e.code==='UNDERFUNDED_BASELINE';}
if(!blocked) throw new Error('Tiny underfunded Runner field was not blocked');
if(db.prepare('SELECT status FROM satellites WHERE id=?').get(tiny.id).status!=='open') throw new Error('Blocked field mutated status');
if(db.prepare('SELECT COUNT(*) n FROM satellite_results WHERE satellite_id=?').get(tiny.id).n!==0) throw new Error('Blocked field wrote results');

// ---- 100-player freeroll: top 10% each get two Runner tickets ----
const freeSat=satellite('free','afternoon',0);
const freeData=buildEntries(freeSat,100,0);
freerollReserve.deposit('afternoon',2000,{referenceType:'test',referenceId:freeSat.id});
const beforeLiability=reserveLedger.balance('ticket_liability');
const freeOut=executeFreeroll({satellite:freeSat,ranked:freeData.ranked,stonkUsdPriceMicros:24000});
if(freeOut.awards.length!==10||freeOut.reserveSpend!==2000) throw new Error('Freeroll payout plan mismatch');
if(Number(freerollReserve.get('afternoon').balance_stonk)!==0) throw new Error('Freeroll reserve did not spend to zero');
const freeTickets=db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='runner'").get(freeSat.id).n;
if(freeTickets!==20) throw new Error(`Expected 20 Runner tickets, got ${freeTickets}`);
if(reserveLedger.balance('ticket_liability')-beforeLiability!==2000) throw new Error('Freeroll ticket liability did not rise by reserve spend');
if(db.prepare('SELECT COUNT(*) n FROM satellite_results WHERE satellite_id=?').get(freeSat.id).n!==100) throw new Error('Missing freeroll result rows');

console.log('satelliteSettlementExecutorV45 tests passed');
