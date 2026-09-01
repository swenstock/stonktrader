'use strict';
const assert=require('assert');
const fs=require('fs');
const {DatabaseSync}=require('node:sqlite');
const {SOURCE_WON,issueFundedJuniorBrokerShare}=require('./juniorBrokerStage2');
const {getBrokerRaceStats}=require('./juniorBrokerRace');

const db=new DatabaseSync(':memory:',{readBigInts:true});
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY,display_name TEXT NOT NULL); CREATE TABLE accounts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id));');
function addAccount(id,name){db.prepare('INSERT INTO users(id,display_name) VALUES(?,?)').run(id,name);db.prepare('INSERT INTO accounts(id,user_id) VALUES(?,?)').run(id,id);}
function award(accountId,count,prefix){for(let i=1;i<=count;i++)issueFundedJuniorBrokerShare(db,{issuanceId:`${prefix}-${i}`,accountId,source:SOURCE_WON});}

addAccount(1,'Nineteen');award(1,19,'n19');
addAccount(2,'Eligible20');award(2,20,'e20');
addAccount(3,'Eligible40');award(3,40,'e40');
for(let i=4;i<=54;i++){addAccount(i,`RawHigh${String(i).padStart(2,'0')}`);award(i,21,`rh${i}`);}

const stats=getBrokerRaceStats(db,{limit:50});
assert.strictEqual(stats.topStackers[0].displayName,'Eligible20','20/20 eligible player should rank first by next-promotion progress');
assert.strictEqual(stats.topStackers[0].progress,20);
assert.strictEqual(stats.topStackers[0].juniorsToNextBroker,0);
assert.strictEqual(stats.topStackers[1].displayName,'Eligible40','40 badges should also resolve to eligible 20/20 progress');
assert.strictEqual(stats.topStackers[1].progressLabel,'20 / 20');
assert.strictEqual(stats.topStackers[2].displayName,'Nineteen','19-badge player must survive SQL LIMIT ahead of raw-quantity 21-badge players');
assert.strictEqual(stats.topStackers[2].progressLabel,'19 / 20');
assert.strictEqual(stats.topStackers[2].juniorsToNextBroker,1);
assert.strictEqual(stats.topStackers.length,50);
assert(stats.topStackers.some(r=>r.displayName==='Nineteen'),'19-badge player was incorrectly excluded before LIMIT');

const backend=fs.readFileSync('server/juniorBrokerRace.js','utf8');
const orderPos=backend.indexOf('ORDER BY CASE');
const limitPos=backend.indexOf('LIMIT ?',orderPos);
assert(orderPos>=0&&limitPos>orderPos,'promotion-progress SQL ORDER BY must occur before LIMIT');
const ui=fs.readFileSync('public/v45-lobby-install-v1.js','utf8');
assert(ui.includes("return'ELIGIBLE'"));
assert(ui.includes('`${toGo} TO GO`'));
assert(ui.includes('progressLabel'));
assert(!ui.includes('juniorCount||0)} BADGES'),'raw holdings display should not drive row value');
assert(ui.includes('TICKET EXCHANGE →'),'eligible state must point to Ticket Exchange without claiming promotion');
const css=fs.readFileSync('public/v45-lobby-install-v1.css','utf8');
assert(css.includes('.rot-near-3')&&css.includes('.rot-near-2')&&css.includes('.rot-near-1')&&css.includes('.rot-eligible'));
console.log('Rise of the Turtles Progress Ranking V2: PASS');
db.close();
