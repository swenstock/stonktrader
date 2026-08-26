'use strict';
const fs=require('fs');
const path='/tmp/sbc-ticket-burn-v45.db';
try{fs.unlinkSync(path)}catch(_){ }
process.env.DB_PATH=path;
const db=require('./db');
require('./schemaV45').run();
const {issueTicket}=require('./ticketServiceV45');
const {burnTicketsForUpgrade,TICKET_BURN_CONFIG}=require('./ticketBurnV45');
const reserveLedger=require('./reserveLedger');

const uid=db.prepare("INSERT INTO users(email,password_hash,display_name,referral_code) VALUES('burn@test','x:y','Burn','BURN01')").run().lastInsertRowid;
const aid=Number(db.prepare('INSERT INTO accounts(user_id) VALUES(?)').run(uid).lastInsertRowid);
for(let i=0;i<10;i++) issueTicket({accountId:aid,ticketType:'runner',backingStonk:100});
if(reserveLedger.balance('ticket_liability')!==1000) throw new Error('seed liability mismatch');
const out=burnTicketsForUpgrade({burnId:'burn-1',accountId:aid,sourceType:'runner'});
if(out.targetTicket.ticket_type!=='clerk') throw new Error('target must be Clerk');
if(Number(out.targetTicket.backing_stonk)!==200) throw new Error('Clerk backing must be 200');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE account_id=? AND ticket_type='runner' AND status='consumed'").get(aid).n!==10) throw new Error('all 10 Runner tickets must be consumed');
if(db.prepare("SELECT COUNT(*) n FROM tickets WHERE account_id=? AND ticket_type='clerk' AND status='unredeemed'").get(aid).n!==1) throw new Error('one Clerk ticket required');
if(reserveLedger.balance('ticket_liability')!==200) throw new Error('burn should release source liability and leave target liability');
let dup=false;try{burnTicketsForUpgrade({burnId:'burn-1',accountId:aid,sourceType:'runner'})}catch(e){dup=e.code==='DUPLICATE_TICKET_BURN'}
if(!dup) throw new Error('duplicate burn must reject');
if(TICKET_BURN_CONFIG.runner.burnCount!==10||TICKET_BURN_CONFIG.clerk.burnCount!==10||TICKET_BURN_CONFIG.trader.burnCount!==10) throw new Error('10:1 must be config-driven');
console.log('Ticket Burn V45: PASS');
console.log('10 Runner -> 1 Clerk; duplicate rejected; source rows consumed');
