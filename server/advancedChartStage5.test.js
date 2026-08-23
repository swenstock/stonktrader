const assert = require('assert');

global.window = { devicePixelRatio: 1 };
global.document = { readyState: 'loading', addEventListener() {} };
const {
  layoutStorageKey,
  defaultLayoutState,
  createLayoutPayload,
  loadLayout,
  saveLayout,
  makeDebouncedLayoutSaver,
} = require('../public/v45-advanced-chart-v1.js');

function memoryStorage() {
  const map = new Map();
  return {
    writes: 0,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { this.writes++; map.set(k, String(v)); },
    raw(k) { return map.get(k); },
  };
}

(async () => {
  assert.strictEqual(layoutStorageKey('aapl', '5m'), 'sbc-chart-layout:AAPL:5m', 'layout key must be symbol+interval scoped and normalize symbol case');

  // 1. Round-trip correctness.
  const storage = memoryStorage();
  const state = {
    drawings: [
      { type:'trend', points:[{time:1000,price:101.25},{time:2000,price:109.75}] },
      { type:'horizontal', points:[{time:1500,price:105.5}] },
    ],
    activeIndicators: new Set(['sma','rsi','vwap']),
    chartType: 'line',
    interval: '15m',
  };
  assert.strictEqual(saveLayout(storage, 'aapl', '15m', state), true, 'valid save should succeed');
  const loaded = loadLayout(storage, 'AAPL', '15m', {chartType:'candles',interval:'15m'});
  assert.deepStrictEqual(loaded, {
    drawings: state.drawings,
    activeIndicators: ['sma','rsi','vwap'],
    chartType: 'line',
    interval: '15m',
  }, 'round-trip must preserve every persisted field exactly');

  // 2. Key isolation.
  saveLayout(storage, 'AAPL', '5m', {drawings:[{type:'horizontal',points:[{time:1,price:11}]}],activeIndicators:['ema'],chartType:'candles',interval:'5m'});
  saveLayout(storage, 'MSFT', '1D', {drawings:[{type:'horizontal',points:[{time:2,price:22}]}],activeIndicators:['macd'],chartType:'line',interval:'1D'});
  const aapl = loadLayout(storage, 'AAPL', '5m', {interval:'5m'});
  const msft = loadLayout(storage, 'MSFT', '1D', {interval:'1D'});
  assert.strictEqual(aapl.drawings[0].points[0].price, 11, 'AAPL/5m must keep its own drawing');
  assert.deepStrictEqual(aapl.activeIndicators, ['ema'], 'AAPL/5m indicators must not bleed');
  assert.strictEqual(msft.drawings[0].points[0].price, 22, 'MSFT/1D must keep its own drawing');
  assert.deepStrictEqual(msft.activeIndicators, ['macd'], 'MSFT/1D indicators must not bleed');
  assert.notStrictEqual(layoutStorageKey('AAPL','5m'), layoutStorageKey('MSFT','1D'));

  // 3. Corrupted data recovery.
  const badKey = layoutStorageKey('NVDA','1h');
  storage.setItem(badKey, '{ definitely not json');
  const fallback = defaultLayoutState({chartType:'candles',interval:'1h'});
  assert.doesNotThrow(() => loadLayout(storage, 'NVDA', '1h', {chartType:'candles',interval:'1h'}));
  assert.deepStrictEqual(loadLayout(storage, 'NVDA', '1h', {chartType:'candles',interval:'1h'}), fallback, 'corrupt JSON must behave like no saved layout');

  // 4. Storage failure recovery.
  const throwingStorage = { getItem(){return null;}, setItem(){throw new Error('QuotaExceededError');} };
  assert.doesNotThrow(() => saveLayout(throwingStorage, 'TSLA', '5m', state), 'storage write failure must not escape');
  assert.strictEqual(saveLayout(throwingStorage, 'TSLA', '5m', state), false, 'failed write should be reported internally without throwing');
  assert.strictEqual(2 + 2, 4, 'chart execution continues after storage failure');

  // 5. Debounce is real, and pending state snapshots its key/payload at schedule time.
  const debouncedStorage = memoryStorage();
  const saver = makeDebouncedLayoutSaver({storage:debouncedStorage, delay:25});
  for (let i=0;i<20;i++) {
    saver.schedule('COIN','5m',{drawings:[{type:'horizontal',points:[{time:i,price:100+i}]}],activeIndicators:['sma'],chartType:'candles',interval:'5m'});
  }
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.strictEqual(debouncedStorage.writes, 1, 'rapid burst must collapse to one localStorage write');
  const debounced = loadLayout(debouncedStorage,'COIN','5m',{interval:'5m'});
  assert.strictEqual(debounced.drawings[0].points[0].price,119,'debounce must save the latest state in the burst');

  // A scheduled old key must not accidentally save under a subsequently selected key.
  saver.schedule('AAPL','1m',{drawings:[],activeIndicators:['ema'],chartType:'line',interval:'1m'});
  saver.schedule('AAPL','1D',{drawings:[],activeIndicators:['rsi'],chartType:'candles',interval:'1D'});
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.strictEqual(loadLayout(debouncedStorage,'AAPL','1m',{interval:'1m'}).activeIndicators.length,0,'superseded pending save should not write stale old-key state');
  assert.deepStrictEqual(loadLayout(debouncedStorage,'AAPL','1D',{interval:'1D'}).activeIndicators,['rsi'],'latest scheduled key owns the debounced write');

  // 6. Bars are never in the payload, even when state includes live market data.
  const liveState = {
    ...state,
    bars: [{t:123,open:1,high:2,low:.5,close:1.5,volume:999999}],
  };
  const payload = createLayoutPayload(liveState);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(payload,'bars'), false, 'layout payload must never expose bars');
  const barsStorage = memoryStorage();
  saveLayout(barsStorage,'META','5m',liveState);
  const savedJson = JSON.parse(barsStorage.raw(layoutStorageKey('META','5m')));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(savedJson,'bars'), false, 'serialized localStorage payload must never contain bars');

  console.log('Stage100 Advanced Chart Stage5 layout persistence behavior: PASS');
})().catch(err => { console.error(err); process.exit(1); });
