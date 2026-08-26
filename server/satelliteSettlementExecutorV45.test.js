const fs=require('fs');const path='/tmp/sbc-settlement-executor-v45.db';try{fs.unlinkSync(path)}catch(_){ }
process.env.DB_PATH=path;
const db=require('./db');require('./schemaV45').run();
const freerollReserve=require('./freerollReserveV45');
const {creditFunding}=require('./prizeReserveLedger');
const {BROKER_RESERVE_BUCKET}=require('./prizeReserveLedger');
const {getContestFundingPoolStatus}=require('./contestJuniorFundingPool');
const {executePaid,executeFreeroll}=require('./satelliteSettlementExecutorV45');
const {getJuniorCount}=require('./juniorBrokerStage2');

function account(i){const u=db.prepare('INSERT INTO users(email,password_hash,display_name,referral_code) VALUES(?,?,?,?)').run(`u${i}@t.local`,'x:y',`U${i}`,`R${1000+i}`).lastInsertRowid;return Number(db.prepare('INSERT INTO accounts(user_id) VALUES(?)').run(u).lastInsertRowid)}
const accounts=Array.from({length:120},(_,i)=>account(i));
function sat(price,tier='morning',fee=100){return db.prepare(`INSERT INTO satellites(tier_id,price_level,name,entry_fee,ticket_cost,opens_at,locks_at,status) VALUES(?,?,?,?,0,?,?,'open') RETURNING *`).get(tier,price,`${tier}-${price}`,fee,new Date().toISOString(),new Date(Date.now()+1000).toISOString())}
function entries(s,n,fee){const es=[],ranked=[];for(let i=0;i<n;i++){const aid=accounts[i];const p=Number(db.prepare('INSERT INTO portfolios(account_id,label) VALUES(?,?)').run(aid,`P${s.id}-${i}`).lastInsertRowid);const e=Number(db.prepare('INSERT INTO satellite_entries(satellite_id,account_id,portfolio_id,entry_fee_paid) VALUES(?,?,?,?)').run(s.id,aid,p,fee).lastInsertRowid);es.push({id:e,account_id:aid,entry_fee_paid:fee,portfolio_id:p});ranked.push({accountId:aid,entryId:e,portfolioId:p,pl:n-i})}return{entries:es,ranked}}

// Seed 39K global carry, then prove the connected Runner walk end to end.
creditFunding(db,{fundingId:'seed:39000',bucket:BROKER_RESERVE_BUCKET,amountSubunits:39000000000n,sourceType:'test',sourceId:'seed',reason:'test_seed'});
const rSat=sat('runner','morning',100);const rd=entries(rSat,20,100);
const out=executePaid({satellite:rSat,entries:rd.entries,ranked:rd.ranked});
if(out.math.badgesAwarded!==1||out.math.badgeFundingContribution!==1000||out.math.stonkFallback!==700) throw new Error('Runner carry math mismatch');
if(getJuniorCount(db,accounts[0])!==1n) throw new Error('rank 1 Badge missing');
const r2=db.prepare('SELECT * FROM satellite_results WHERE satellite_id=? AND rank=2').get(rSat.id);
if(r2.prize_type!=='stonk_cash_prize'||Number(r2.stonk_bonus)!==700) throw new Error('rank 2 Runner STONK fallback mismatch');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='main_event'").get(rSat.id).n!==0) throw new Error('Main Event ticket must never be created');
if(getContestFundingPoolStatus(db).unallocatedSubunits!==0n) throw new Error('39K+1K should be fully consumed by Badge');

// Fixed fallback: Clerk with no carry should issue two Runner tickets to each protected finisher and carry the surplus.
const cSat=sat('low','full_day',150);const cd=entries(cSat,20,150);
const cOut=executePaid({satellite:cSat,entries:cd.entries,ranked:cd.ranked});
if(cOut.math.badgesAwarded!==0) throw new Error('Clerk should not self-fund a 40K Badge here');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=? AND ticket_type='runner'").get(cSat.id).n!==4) throw new Error('Clerk top 2 should each get 2 Runner tickets');

// Free Roll: local 45.5K -> one fully-backed Badge + 5.5K cash; zero tickets.
const fSat=sat('free','afternoon',0);const fd=entries(fSat,100,0);
freerollReserve.deposit('afternoon',45500,{referenceType:'test',referenceId:fSat.id});
const fOut=executeFreeroll({satellite:fSat,ranked:fd.ranked});
if(fOut.math.badgesAwarded!==1||fOut.math.cashDistributed!==5500) throw new Error('Free Roll plan mismatch');
if(getJuniorCount(db,accounts[0])!==2n) throw new Error('Free Roll Badge missing for rank 1');
if(db.prepare('SELECT COUNT(*) n FROM tickets WHERE source_satellite_id=?').get(fSat.id).n!==0) throw new Error('Free Roll must issue zero tickets');
if(Number(freerollReserve.get('afternoon').balance_stonk)!==0) throw new Error('Free Roll local reserve should be spent exactly');
const cash=Number(db.prepare("SELECT COALESCE(SUM(stonk_bonus),0) n FROM satellite_results WHERE satellite_id=?").get(fSat.id).n);if(cash!==5500) throw new Error(`Free Roll cash mismatch ${cash}`);

console.log('satelliteSettlementExecutorV45 tests passed');
console.log('Runner 39K carry -> 1K contribution -> Badge + 700 STONK');
console.log('Clerk -> 2 Runner tickets each for protected finishers');
console.log('Free Roll 45.5K -> Badge + 5.5K STONK, zero tickets');
