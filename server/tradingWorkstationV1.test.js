'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-trading-workstation-v1.js'), 'utf8');

function loadApi(){
  const document = {
    readyState: 'loading',
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
  };
  const window = {
    addEventListener(){},
    dispatchEvent(){},
  };
  const context = vm.createContext({
    window,
    document,
    console,
    setTimeout(){ return 0; },
    setInterval(){ return 0; },
    clearInterval(){},
    requestAnimationFrame(fn){ return fn(); },
    MutationObserver: class { observe(){} },
    Event: class Event {},
    CustomEvent: class CustomEvent {},
    fetch(){ throw new Error('unexpected global fetch'); },
    localStorage: { getItem(){ return null; } },
  });
  vm.runInContext(source, context, { filename: 'v45-trading-workstation-v1.js' });
  return context.window.__SBC_TRADING_WORKSTATION_TEST;
}

(async()=>{
  const api = loadApi();
  assert(api, 'test API must be exposed');
  assert.strictEqual(api.QUOTE_ROUTE, '/api/quotes');

  assert.deepStrictEqual(
    Array.from(api.parseSymbols('aapl|MSFT, nvda;AAPL bad$symbol')),
    ['AAPL','MSFT','NVDA'],
    'pipe/comma/space basket-style symbol input must normalize and dedupe'
  );

  const storage = { getItem(key){
    assert.strictEqual(key, 'sbcLastBasketV45');
    return JSON.stringify({ rows:[{symbol:'tsla'},{symbol:'AAPL'},{symbol:'TSLA'},{symbol:'bad$'}] });
  }};
  assert.deepStrictEqual(
    Array.from(api.savedBasketSymbols(storage)),
    ['TSLA','AAPL'],
    'saved basket must be copied as symbols only'
  );

  const calls=[];
  const fakeFetch = async (url, options)=>{
    calls.push({url, options});
    assert.strictEqual(url, '/api/quotes?symbols=AAPL%2CMSFT');
    assert.strictEqual(options.method, 'GET');
    assert.strictEqual(options.cache, 'no-store');
    assert.strictEqual(options.headers.Accept, 'application/json');
    return { ok:true, async json(){ return [{symbol:'AAPL',price:100},{symbol:'MSFT',price:200}]; } };
  };
  const rows = await api.fetchQuotes(['AAPL','MSFT'], fakeFetch);
  assert.strictEqual(calls.length, 1, 'quote refresh must make exactly one request');
  assert.strictEqual(rows.length, 2);

  const forbidden = [
    '/api/portfolios', '/api/advanced-orders', '/api/scheduled-orders',
    'submitTrade', 'submitOrder', 'placeOrder', 'method:\'POST\'', 'method:"POST"'
  ];
  for(const needle of forbidden){
    assert(!source.includes(needle), `quote workstation must not contain order-submission path: ${needle}`);
  }

  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-trading-workstation-v1.css'), 'utf8');
  assert(css.includes('grid-template-columns:minmax(0,1fr) minmax(0,1fr)'), 'workstation must remain a two-column split');
  assert(css.includes('grid-column:1'), 'Order Entry must be pinned left on mobile');
  assert(css.includes('grid-column:2'), 'Quote window must be pinned right on mobile');

  console.log('tradingWorkstationV1 acceptance: PASS');
})().catch(err=>{ console.error(err); process.exit(1); });
