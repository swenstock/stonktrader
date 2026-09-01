'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const {computePaidContest,computeCascadingContest,computeFreerollPlan}=require('./payoutEngineV2');
function runUi(relativePath){const file=path.join(__dirname,'..',relativePath),source=fs.readFileSync(file,'utf8'),sandbox={window:{},console};vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:path.basename(file)});return sandbox.window}
const race=runUi('public/v45-broker-race-ui.js').__SBC_BROKER_RACE_UI_TEST;assert.ok(race);assert.strictEqual(race.PROMOTION_COPY.heroHeadline,"CAN'T AFFORD ONE?");assert.ok(race.PROMOTION_COPY.heroSupport.includes('COLLECT 20. GET PROMOTED.'));assert.strictEqual(race.leadersEmbedded,false);
const prize=runUi('public/v45-prize-info-v65.js').__SBC_PRIZE_INFO_V65_TEST;const html=prize.bodyHtml();
assert.ok(html.includes('TICKETS GET YOU IN'));assert.ok(html.includes('BADGES GET YOU PROMOTED'));assert.ok(html.includes('2 Runner tickets'));assert.ok(html.includes('2 Clerk tickets'));assert.ok(html.includes('2 Trader tickets'));assert.ok(html.includes('20 Jr. Broker Badges'));assert.ok(html.includes('10 Runner tickets'));assert.ok(!/Main Event|main_event/i.test(html));
for(const tierKey of ['runner','clerk','trader','junior']){const r=computeCascadingContest({tierKey,fieldSize:20,poolUnallocatedStonk:39000});assert.equal(r.paidPlaces,2);assert.equal(r.payouts.length,2);assert.equal(r.reconciliation.prize,true);assert.equal(r.payouts.some(p=>p.ticketTier==='main_event'||p.award==='main_event_ticket'),false)}
const runner=computePaidContest({tierKey:'runner',fieldSize:20,poolUnallocatedStonk:39000});assert.equal(runner.badgesAwarded,1);assert.equal(runner.payouts[0].badgeFundingContribution,1000);assert.equal(runner.payouts[1].stonkBonus,700);
const clerk=computePaidContest({tierKey:'clerk',fieldSize:20,poolUnallocatedStonk:0});assert.deepStrictEqual(clerk.payouts.map(p=>[p.ticketTier,p.quantity]),[['runner',2],['runner',2]]);
const free=computeFreerollPlan({fieldSize:20,reserveBalance:500});assert.equal(free.badgesAwarded,0);assert.equal(free.cashDistributed,0);assert.equal(free.reserveRemainder,500);assert.equal(free.payouts.length,0);
console.log('Corporate ladder + promotion GUI: PASS');
console.log('Promotion path:',"TICKETS GET YOU IN -> BADGES GET YOU PROMOTED -> COLLECT 20");
console.log('Runner:', '39K carry + 1K contest -> Badge; 700 STONK fallback');
console.log('Prize copy:', 'zero Main Event destination; tier fallbacks + Badge promotion explained');
