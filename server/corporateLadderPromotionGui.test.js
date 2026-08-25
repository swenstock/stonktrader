'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  computePaidContest,
  computeCascadingContest,
  computeFreerollRequirement,
} = require('./payoutEngineV2');

function runUi(relativePath) {
  const file = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: path.basename(file) });
  return sandbox.window;
}

const race = runUi('public/v45-broker-race-ui.js').__SBC_BROKER_RACE_UI_TEST;
assert.ok(race);
assert.strictEqual(race.PROMOTION_COPY.heroHeadline, "CAN'T AFFORD ONE?");
assert.strictEqual(race.PROMOTION_COPY.heroAction, 'CLIMB THE LADDER.');
assert.ok(race.PROMOTION_COPY.heroSupport.includes('COLLECT 20. GET PROMOTED.'));
assert.strictEqual(race.PROMOTION_COPY.topTitle, '🔥 NEXT IN LINE FOR PROMOTION');
assert.strictEqual(race.PROMOTION_COPY.topLabel, 'TOP 5 COLLECTORS');

const prize = runUi('public/v45-prize-info-v65.js').__SBC_PRIZE_INFO_V65_TEST;
assert.ok(prize && typeof prize.bodyHtml === 'function');
const html = prize.bodyHtml();
assert.ok(html.includes('EVERY PAID FINISHER GETS A BASELINE PRIZE'));
assert.ok(html.includes('2 Runner tickets'));
assert.ok(html.includes('2 Clerk tickets'));
assert.ok(html.includes('2 Trader tickets'));
assert.ok(html.includes('JR. STONKBROKER PROMOTION PATH'));
assert.ok(html.includes('Collect 20 Jr. StonkBrokers and get promoted to an Activated StonkBroker.'));
assert.ok(!html.includes('0 Brokers fully funded'));
assert.ok(!html.includes('1st wins the full 85% prize pool'));

// Behavioral proof that the reverse-funding model is already real settlement math,
// not merely new GUI copy.
for (const tierKey of ['runner','clerk','trader','junior']) {
  const result = computeCascadingContest({ tierKey, fieldSize: 20 });
  assert.strictEqual(result.status, 'OK');
  assert.strictEqual(result.paidPlaces, 2, `${tierKey}: top 10% of 20 should be two paid places`);
  assert.strictEqual(result.payouts.length, 2);
  assert.ok(result.payouts.every(p => p.quantity > 0 || p.stonkBonus > 0), `${tierKey}: every paid place must walk away with value`);
  assert.strictEqual(result.reconciliation.prize, true, `${tierKey}: prize pool must reconcile`);
}

const runner = computePaidContest({ tierKey: 'runner', fieldSize: 20 });
assert.strictEqual(runner.mainEventTickets, 0);
assert.deepStrictEqual(runner.payouts.map(p => [p.ticketTier, p.quantity]), [['runner',2],['runner',2]]);

const clerk = computePaidContest({ tierKey: 'clerk', fieldSize: 20 });
assert.strictEqual(clerk.mainEventTickets, 0);
assert.deepStrictEqual(clerk.payouts.map(p => [p.ticketTier, p.quantity]), [['runner',2],['runner',2]]);

const freeroll = computeFreerollRequirement({ fieldSize: 20, runnerTicketBacking: 100 });
assert.strictEqual(freeroll.paidPlaces, 2);
assert.strictEqual(freeroll.ticketsPerWinner, 2);
assert.strictEqual(freeroll.ticketsRequired, 4);

console.log('Corporate ladder + promotion GUI: PASS');
console.log('Promotion path:', "CAN'T AFFORD ONE? -> CLIMB THE LADDER -> COLLECT 20 -> GET PROMOTED");
console.log('Top 10%:', 'reverse-funding engine verified; every paid finisher receives funded value');
console.log('Baseline:', 'Runner and Clerk 20-player examples pay both top-10% finishers 2 Runner tickets each');
console.log('Prize copy:', 'stale direct 733,332 Main Event payout table removed from player-facing modal');
