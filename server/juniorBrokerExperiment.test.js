const assert = require('assert');
const fs = require('fs');
const path = require('path');

const junior = require('../public/junior/junior.js');

assert.strictEqual(junior.JR_UNIT_STONK, 40000);
assert.strictEqual(junior.JR_PER_BROKER, 20);
assert.strictEqual(junior.ACTIVATED_BROKER_STONK, 733332);
assert.ok(Math.abs(junior.CUSHION_PER_JR - 3333.4) < 1e-9);

let p = junior.juniorProjection(0);
assert.strictEqual(p.fundedJuniors, 0);
assert.strictEqual(p.fullBrokers, 0);
assert.strictEqual(p.juniorProgress, 0);
assert.strictEqual(p.nextJuniorNeedsStonk, 40000);

p = junior.juniorProjection(39999);
assert.strictEqual(p.fundedJuniors, 0);
assert.strictEqual(p.unallocatedStonk, 39999);
assert.strictEqual(p.nextJuniorNeedsStonk, 1);

p = junior.juniorProjection(40000);
assert.strictEqual(p.fundedJuniors, 1);
assert.strictEqual(p.fullBrokers, 0);
assert.strictEqual(p.juniorProgress, 1);
assert.strictEqual(p.unallocatedStonk, 0);
assert.strictEqual(p.nextJuniorNeedsStonk, 40000);
assert.ok(Math.abs(p.reserveCushionStonk - 3333.4) < 1e-9);

p = junior.juniorProjection(733332);
assert.strictEqual(p.fundedJuniors, 18);
assert.strictEqual(p.fullBrokers, 0);
assert.strictEqual(p.juniorProgress, 18);
assert.strictEqual(p.unallocatedStonk, 13332);
assert.strictEqual(p.nextJuniorNeedsStonk, 26668);

p = junior.juniorProjection(800000);
assert.strictEqual(p.fundedJuniors, 20);
assert.strictEqual(p.fullBrokers, 1);
assert.strictEqual(p.juniorProgress, 0);
assert.strictEqual(p.meterPercent, 100);
assert.ok(Math.abs(p.reserveCushionStonk - 66668) < 1e-6);
assert.strictEqual(junior.projectionLabel(p), '1 BROKER FUNDED');

p = junior.juniorProjection(1000000);
assert.strictEqual(p.fundedJuniors, 25);
assert.strictEqual(p.fullBrokers, 1);
assert.strictEqual(p.juniorProgress, 5);
assert.strictEqual(junior.projectionLabel(p), '1 BROKER + 5 JR');

p = junior.juniorProjection(1600000);
assert.strictEqual(p.fundedJuniors, 40);
assert.strictEqual(p.fullBrokers, 2);
assert.strictEqual(p.juniorProgress, 0);
assert.ok(Math.abs(p.reserveCushionStonk - 133336) < 1e-6);

assert.strictEqual(junior.parseStonk('733,332 STONK'), 733332);
assert.strictEqual(junior.parseStonk('0 STONK'), 0);

const html = fs.readFileSync(path.join(__dirname, '../public/junior/index.html'), 'utf8');
assert.ok(html.includes('../v45/v45.css'), 'experiment must reuse V45 styling');
assert.ok(html.includes('../v45/v45.js'), 'experiment must reuse V45 application engine');
assert.ok(html.includes('20 JR = 1 ACTIVATED STONKBROKER'), 'redemption rule must be visible');
assert.ok(html.includes('40,000 STONK'), 'funding unit must be visible');
assert.ok(html.includes('Existing production settlement rules are unchanged'), 'experiment boundary must be explicit');
assert.ok(html.includes('CURRENT V45'), 'reversible build must link back to current V45');

const css = fs.readFileSync(path.join(__dirname, '../public/junior/junior.css'), 'utf8');
assert.ok(css.includes('.jr-payout-grid'));
assert.ok(css.includes('.jr-system-grid'));

console.log('Junior Broker isolated experiment economics + shell contract: PASS');
