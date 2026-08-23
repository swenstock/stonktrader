const assert = require('assert');
const {
  CATALOG,
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  vwap,
  atr,
  supertrend,
  computeIndicator,
  filterCatalog,
} = require('../public/v45-advanced-chart-indicators-v1.js');

const near = (a,b,eps=1e-8,msg='values differ') => assert(Math.abs(a-b) <= eps, `${msg}: ${a} vs ${b}`);
const closes = [1,2,3,4,5,6,7,8,9,10];

// Real moving-average calculations against deterministic inputs.
const s = sma(closes, 3);
assert.deepStrictEqual(s.slice(0,4), [null,null,2,3], 'SMA must use a real rolling window');
near(s[9], 9, 1e-12, 'SMA tail');
const e = ema(closes, 3);
near(e[2], 2, 1e-12, 'EMA seed must be the initial SMA');
near(e[3], 3, 1e-12, 'EMA must advance recursively');
near(e[9], 9, 1e-12, 'EMA linear-series tail');

// RSI must react to direction, not return a static placeholder.
const upRsi = rsi([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 14);
assert.strictEqual(upRsi[14], 100, 'all-up RSI should be 100 after warmup');
const mixedRsi = rsi([10,11,9,12,8,13,7,14,6,15,5,16,4,17,3,18,2,19], 14);
assert(mixedRsi[14] > 0 && mixedRsi[14] < 100, 'mixed RSI must be bounded and nontrivial');

// MACD must be derived from independently computed EMAs and expose histogram.
const m = macd(Array.from({length:60}, (_,i)=>100+i+(i%4===0?2:-1)), 12, 26, 9);
const last = m.line.length - 1;
assert(Number.isFinite(m.line[last]), 'MACD line must warm up');
assert(Number.isFinite(m.signal[last]), 'MACD signal must warm up');
near(m.histogram[last], m.line[last] - m.signal[last], 1e-12, 'MACD histogram identity');

// Bollinger bands must be symmetric around the rolling mean.
const bb = bollinger([1,2,3,4,5,6,7,8,9,10], 5, 2);
near((bb.upper[9] + bb.lower[9]) / 2, bb.middle[9], 1e-12, 'Bollinger symmetry');
assert(bb.upper[9] > bb.middle[9] && bb.lower[9] < bb.middle[9], 'Bollinger band ordering');

// VWAP must use volume weighting, not a simple close average.
const bars = [
  {t:1,open:10,high:10,low:10,close:10,volume:1},
  {t:2,open:20,high:20,low:20,close:20,volume:9},
  {t:3,open:15,high:16,low:14,close:15,volume:5},
];
const vw = vwap(bars);
near(vw[1], 19, 1e-12, 'VWAP weighted second point');
assert(vw[1] !== 15, 'VWAP must differ from the simple average when volume is uneven');

// ATR and Supertrend must be data-driven and aligned to bars.
const trendBars = Array.from({length:40}, (_,i)=>({
  t:i*60000, open:100+i, high:102+i, low:99+i, close:101+i, volume:1000+i*10,
}));
const a = atr(trendBars, 10);
assert.strictEqual(a.length, trendBars.length, 'ATR must align to source bars');
assert(Number.isFinite(a[9]), 'ATR must warm up at its configured period');
const st = supertrend(trendBars, 10, 3);
assert.strictEqual(st.line.length, trendBars.length, 'Supertrend must align to source bars');
assert(st.line.some(Number.isFinite), 'Supertrend must produce a real plotted line');
assert(st.direction.filter(Number.isFinite).every(v=>v===1||v===-1), 'Supertrend direction must be signed');

// Public indicator dispatcher must return real series for every Stage 4 core indicator.
for (const id of ['sma','ema','rsi','macd','bb','vwap','supertrend']) {
  const result = computeIndicator(id, trendBars);
  assert(result, `${id} must be implemented`);
  assert(Array.isArray(result.lines) && result.lines.length, `${id} must expose plottable lines`);
}

// The searchable library must contain dozens of indicators while clearly disabling unfinished ones.
assert(CATALOG.length >= 35, 'indicator library should contain dozens of searchable entries');
const fav = new Set(['vwap']);
const volumeSearch = filterCatalog('volume', fav);
assert(volumeSearch.some(x=>x.id==='vwap'), 'search should match category/name text');
const all = filterCatalog('', fav);
assert.strictEqual(all[0].id, 'vwap', 'favorites should sort ahead of non-favorites');
assert(all.some(x=>x.implemented === false), 'unimplemented library items must remain explicitly disabled');

console.log('Stage98 Advanced Chart Stage4 indicators behavior: PASS');
