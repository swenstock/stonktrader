'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-badge-market-stage4.js'), 'utf8');

const listeners = new Map();
const document = {
  readyState: 'loading',
  documentElement: {},
  addEventListener(type, fn) { listeners.set(type, fn); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { style:{}, dataset:{}, classList:{ add(){}, remove(){} }, appendChild(){}, addEventListener(){}, querySelector(){return null;} }; },
};
class MutationObserver { constructor(fn){ this.fn=fn; } observe(){} disconnect(){} }
class Headers {
  constructor(init={}) { this.map = new Map(Object.entries(init).map(([k,v])=>[String(k).toLowerCase(),String(v)])); }
  get(name){ return this.map.get(String(name).toLowerCase()) || null; }
}
const localStorage = { length:0, key(){return null;}, getItem(){return null;} };
const fakeFetch = async () => ({ ok:true, async json(){ return {}; } });
const window = { fetch:fakeFetch };
window.window = window;
const context = vm.createContext({
  window, document, MutationObserver, Headers, localStorage,
  fetch:fakeFetch,
  console,
  alert(){}, confirm(){ return true; }, prompt(){ return null; },
  setTimeout(){}, clearTimeout(){},
});
vm.runInContext(source, context, { filename:'v45-badge-market-stage4.js' });
const hooks = window.__SBC_BADGE_MARKET_STAGE4_TEST;
assert.ok(hooks, 'Stage 4 UI test hooks must be exposed by the actual browser script');

function warning(price, lowestAsk, recentPrice=null) {
  return hooks.warningFor(price, {
    lowestAsk,
    recentTrades: recentPrice == null ? [] : [{ price:recentPrice }],
    warningThreshold:0.25,
    floor:36666.6,
    mintPrice:48000,
  });
}

const low = warning(10000, 40000);
assert.ok(low, 'well-below-market seller price outside band must warn');
assert.strictEqual(low.ref, 40000);
assert.ok(Math.abs(low.gap - 0.75) < 1e-12);

const high = warning(100000, 40000);
assert.ok(high, 'well-above-market buyer price outside band must warn');
assert.strictEqual(high.ref, 40000);
assert.ok(Math.abs(high.gap - 1.5) < 1e-12);

const thinButSensible = warning(48000, 36667);
assert.strictEqual(thinButSensible, null, 'price inside known floor-to-mint band must not warn even when >25% from thin-market reference');

const justInside = warning(30001, 40000);
assert.strictEqual(justInside, null, 'price just inside 25% threshold must not warn');

const noAskUsesLastSale = warning(100000, null, 40000);
assert.ok(noAskUsesLastSale, 'last sale must be used when no active ask exists');
assert.strictEqual(noAskUsesLastSale.ref, 40000);

const firstEver = warning(10000, null, null);
assert.strictEqual(firstEver, null, 'first-ever market with no ask and no completed sale must not warn');

console.log('Ticket Exchange Stage 4 mispricing UI: PASS');
console.log('Actual browser script: symmetric warning, >25% + outside-band gate, last-sale fallback, and first-ever no-reference behavior verified');
