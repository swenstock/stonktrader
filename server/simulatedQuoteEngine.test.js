const assert = require('assert');
const { simulatedPrice, getSimulatedQuote, getSimulatedBars } = require('./simulatedQuoteEngine');

const META = {
  symbol: 'NVDA', name: 'NVIDIA Corp.', exchange: 'NASDAQ', currency: 'USD',
  base: 220.30, marketCap: 5_400_000_000_000
};

const t1 = new Date('2026-08-17T13:30:00.000Z'); // 9:30 ET
const t2 = new Date('2026-08-17T14:30:00.000Z'); // 10:30 ET

const a = simulatedPrice('NVDA', META.base, t1);
const b = simulatedPrice('NVDA', META.base, t1);
assert.strictEqual(a, b, 'same time must reproduce identical price');
assert.notStrictEqual(a, simulatedPrice('NVDA', META.base, t2), 'different time should normally move price');

const q = getSimulatedQuote(META, t1);
assert.strictEqual(q.source, 'sim');
assert.strictEqual(q.symbol, 'NVDA');
assert.strictEqual(q.timestamp, t1.toISOString());
assert.ok(Number.isFinite(q.price));
assert.ok(Number.isFinite(q.changePct));

const bars1 = getSimulatedBars(META, '5m', t1, new Date(t1.getTime() + 30 * 60000));
const bars2 = getSimulatedBars(META, '5m', t1, new Date(t1.getTime() + 30 * 60000));
assert.deepStrictEqual(bars1, bars2, 'bar generation must be reproducible');
assert.strictEqual(bars1.length, 6);
for (const bar of bars1) {
  assert.ok(bar.high >= bar.open && bar.high >= bar.close);
  assert.ok(bar.low <= bar.open && bar.low <= bar.close);
  assert.ok(bar.volume > 0);
}

console.log('simulatedQuoteEngine tests passed');
