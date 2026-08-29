const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('./routes/quoteBars');

test('chart lookback starts stay locked to interval boundaries', () => {
  const step = 5 * 60 * 1000;
  const count = 288;
  const multiplier = 5;
  const t1 = Date.parse('2026-08-29T15:15:02.000Z');
  const t2 = Date.parse('2026-08-29T15:15:57.000Z');
  const a = _test.alignedLookbackStart(t1, count, step, multiplier);
  const b = _test.alignedLookbackStart(t2, count, step, multiplier);
  assert.equal(a % step, 0);
  assert.equal(b % step, 0);
  assert.equal(a, b, 'same 5m bucket must not retimestamp the whole chart');
});

test('chart response cache key is stable inside a minute and rolls at the next minute', () => {
  const t1 = Date.parse('2026-08-29T15:15:02.000Z');
  const t2 = Date.parse('2026-08-29T15:15:57.000Z');
  const t3 = Date.parse('2026-08-29T15:16:00.000Z');
  assert.equal(_test.minuteCacheKey('AAPL', '5m', t1), _test.minuteCacheKey('AAPL', '5m', t2));
  assert.notEqual(_test.minuteCacheKey('AAPL', '5m', t2), _test.minuteCacheKey('AAPL', '5m', t3));
});
