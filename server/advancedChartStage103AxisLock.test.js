const assert = require('assert');

const {
  decidePanAxis,
  panDomainWithAxisLock,
} = require('../public/v45-advanced-chart-axis-lock-v1.js');

const domain={minTime:1000,maxTime:5000,minPrice:90,maxPrice:110};

assert.strictEqual(decidePanAxis(40,3,5,1.5),'time');
const horizontal=panDomainWithAxisLock(domain,400,250,440,253,1000,500,'time');
assert.notStrictEqual(horizontal.minTime,domain.minTime);
assert.strictEqual(horizontal.minPrice,domain.minPrice);
assert.strictEqual(horizontal.maxPrice,domain.maxPrice);

assert.strictEqual(decidePanAxis(3,40,5,1.5),'price');
const vertical=panDomainWithAxisLock(domain,400,250,403,290,1000,500,'price');
assert.notStrictEqual(vertical.minPrice,domain.minPrice);
assert.strictEqual(vertical.minTime,domain.minTime);
assert.strictEqual(vertical.maxTime,domain.maxTime);

assert.strictEqual(decidePanAxis(25,25,5,1.5),'both');
const diagonal=panDomainWithAxisLock(domain,400,250,425,275,1000,500,'both');
assert.notStrictEqual(diagonal.minTime,domain.minTime);
assert.notStrictEqual(diagonal.minPrice,domain.minPrice);

assert.strictEqual(decidePanAxis(2,1,5,1.5),null);
assert.strictEqual(decidePanAxis(8,2,5,1.5),'time');

const heldTime=panDomainWithAxisLock(domain,400,250,440,280,1000,500,'time');
assert.strictEqual(heldTime.minPrice,domain.minPrice);
assert.strictEqual(heldTime.maxPrice,domain.maxPrice);

console.log('Stage103 Advanced Chart axis-dominance pan locking behavior: PASS');
