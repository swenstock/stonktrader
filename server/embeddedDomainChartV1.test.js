const assert=require('assert');
const {panTimeDomain,zoomTimeDomain,zoomPriceDomain,scalePriceDomainFromDrag}=require('../public/v45-embedded-domain-chart-v1.js');

const base={minTime:0,maxTime:1000};
const left=panTimeDomain(base,100,500);
assert.strictEqual(left.minTime,-200,'dragging right must shift the time domain left instead of snapping to latest');
assert.strictEqual(left.maxTime,800,'dragging right must preserve the full domain span');
const right=panTimeDomain(base,-100,500);
assert.strictEqual(right.minTime,200,'dragging left must move to later time with no zero clamp');
assert.strictEqual(right.maxTime,1200,'dragging left must allow right-side future whitespace');

const compact=zoomTimeDomain(base,500,120);
assert(compact.maxTime-compact.minTime>1000,'positive wheel delta must expand time span and compact more candles');
assert(Math.abs((compact.minTime+compact.maxTime)/2-500)<1e-9,'time zoom must stay anchored around the cursor');
const expand=zoomTimeDomain(base,500,-120);
assert(expand.maxTime-expand.minTime<1000,'negative wheel delta must contract time span and expand candle spacing');

const price={minPrice:90,maxPrice:110};
const priceCompact=zoomPriceDomain(price,100,120);
assert(priceCompact.maxPrice-priceCompact.minPrice>20,'price-axis wheel must expand price span independently');
const priceDrag=scalePriceDomainFromDrag(price,100,50,400);
assert(priceDrag.maxPrice-priceDrag.minPrice<20,'dragging price scale upward must compress price-domain span');

const fs=require('fs');
const client=fs.readFileSync('public/v45-embedded-domain-chart-v1.js','utf8');
assert(client.includes("c.addEventListener('wheel'"),'embedded chart must own direct wheel interaction');
assert(client.includes("c.addEventListener('pointerdown'"),'embedded chart must own direct grab interaction');
assert(client.includes("e.stopPropagation()"),'embedded chart gestures must not bubble into legacy Stage45 handlers');
assert(client.includes("state.followLatest=false"),'manual time movement must disengage automatic right-edge following');
assert(client.includes("ResizeObserver"),'canvas must resize without a document-wide mutation observer');
assert(!client.includes('new MutationObserver'),'embedded chart must not add a document-wide mutation observer');
console.log('Embedded domain chart v1: PASS');
