const assert = require('assert');
const {
  makeView,
  medianVisibleSpacingMs,
  candleWidthPx,
  nearestBarByTime,
  priceScaleDomainFromDrag,
} = require('../public/v45-advanced-chart-v1.js');

const pad = { l: 8, r: 56, t: 10, b: 24 };
const view = makeView(1000, 600, pad);
view.setDomain(0, 60000, 90, 110);

// Median spacing must ignore irregular outliers and use visible bars.
const irregular = [
  { t: 0, open:100, high:101, low:99, close:100, volume:1 },
  { t: 10000, open:100, high:101, low:99, close:100, volume:1 },
  { t: 20000, open:100, high:101, low:99, close:100, volume:1 },
  { t: 30000, open:100, high:101, low:99, close:100, volume:1 },
  { t: 120000, open:100, high:101, low:99, close:100, volume:1 },
];
assert.strictEqual(medianVisibleSpacingMs(irregular, view), 10000, 'median visible spacing should resist a large timestamp gap');
assert(candleWidthPx(irregular, view) > 1, 'median spacing should produce a usable candle width');

// Crosshair OHLC selection must choose the genuinely nearest bar by timestamp.
const b = nearestBarByTime(irregular, 18600);
assert.strictEqual(b.t, 20000, 'nearest-bar lookup should select the closest OHLC bar');
const b2 = nearestBarByTime(irregular, 15100);
assert.strictEqual(b2.t, 20000, 'nearest-bar lookup should work on the upper side of a midpoint');

// Price-scale drag must change price only. Time is deliberately untouched by the helper/caller contract.
const before = { minTime:view.state.minTime, maxTime:view.state.maxTime, minPrice:90, maxPrice:110 };
const zoomIn = priceScaleDomainFromDrag(before, 300, 220, 566);
assert(zoomIn.maxPrice - zoomIn.minPrice < 20, 'dragging up on price scale should contract the price range');
assert(Math.abs((zoomIn.minPrice + zoomIn.maxPrice) / 2 - 100) < 1e-9, 'price zoom should preserve price-range center');
assert.strictEqual(view.state.minTime, before.minTime, 'price-scale helper must not mutate time minimum');
assert.strictEqual(view.state.maxTime, before.maxTime, 'price-scale helper must not mutate time maximum');
const zoomOut = priceScaleDomainFromDrag(before, 300, 380, 566);
assert(zoomOut.maxPrice - zoomOut.minPrice > 20, 'dragging down on price scale should expand the price range');

console.log('Stage97 Advanced Chart Stage3 behavior: PASS');
