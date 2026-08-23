const assert = require('assert');

global.window = { devicePixelRatio: 1 };
global.document = { readyState: 'loading', addEventListener() {} };
const {
  priceScaleDomainFromDrag,
  panDomainFromDrag,
} = require('../public/v45-advanced-chart-v1.js');

const domain = { minTime: 1000, maxTime: 5000, minPrice: 90, maxPrice: 110 };

// Right-side price scale: upward drag compresses range; downward drag expands it.
const up = priceScaleDomainFromDrag(domain, 300, 220, 500);
assert(up.maxPrice - up.minPrice < 20, 'upward price-axis drag must compress the visible price range');
assert.strictEqual((up.maxPrice + up.minPrice) / 2, 100, 'price-axis scaling must preserve price center');
const down = priceScaleDomainFromDrag(domain, 300, 380, 500);
assert(down.maxPrice - down.minPrice > 20, 'downward price-axis drag must expand the visible price range');

// Plot drag: horizontal movement pans time without changing price span.
const horizontal = panDomainFromDrag(domain, 400, 250, 500, 250, 1000, 500);
assert(horizontal.minTime < domain.minTime, 'dragging plot right must move the visible time window earlier');
assert.strictEqual(horizontal.maxTime - horizontal.minTime, 4000, 'plot pan must preserve time span');
assert.strictEqual(horizontal.minPrice, 90, 'pure horizontal pan must not shift price');
assert.strictEqual(horizontal.maxPrice, 110, 'pure horizontal pan must not shift price');

// Plot drag: vertical movement pans price without changing price span or time.
const vertical = panDomainFromDrag(domain, 400, 250, 400, 350, 1000, 500);
assert(vertical.minPrice > domain.minPrice, 'dragging plot down must move the visible price window upward');
assert.strictEqual(vertical.maxPrice - vertical.minPrice, 20, 'plot pan must preserve price span');
assert.strictEqual(vertical.minTime, 1000, 'pure vertical pan must not shift time');
assert.strictEqual(vertical.maxTime, 5000, 'pure vertical pan must not shift time');

// Combined drag moves both axes while preserving both spans.
const combined = panDomainFromDrag(domain, 400, 250, 250, 150, 1000, 500);
assert.notStrictEqual(combined.minTime, domain.minTime, 'combined drag must pan time');
assert.notStrictEqual(combined.minPrice, domain.minPrice, 'combined drag must pan price');
assert.strictEqual(combined.maxTime - combined.minTime, 4000, 'combined pan preserves time span');
assert.strictEqual(combined.maxPrice - combined.minPrice, 20, 'combined pan preserves price span');

console.log('Stage101 Advanced Chart direct price-scale + 2D plot navigation behavior: PASS');
