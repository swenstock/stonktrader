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

  assert(source.includes("im.closest('.mini-tier,.session,.mc-card,.floor-clean-card,.mobile-path-row,.step,.mobile-floor-brokers')"), 'legacy portrait cleanup must stay scoped to turtle-tier contexts');
  assert(!source.includes('.sbc-jr4-card,.exchange-page,.badge-market,.ticket-market'), 'Jr Stonk Broker Badge/exchange surfaces must not be classified as turtle tiers');
  assert(!source.includes('.sbc-jr4-badge-art img'), 'human Jr Stonk Broker Badge art must not be normalized into turtle art');
  assert(!source.includes('.ticket-filter-art img'), 'ticket-market art must stay outside turtle normalizer');
  assert(!source.includes('.mobile-exchange-art img'), 'mobile exchange art must stay outside turtle normalizer');

  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'v45-trading-workstation-v1.css'), 'utf8');
  const desktopRule='#view-portfolio .sbc-quote-oe-grid-v1{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:stretch;width:100%;margin-top:14px}';
  assert(css.includes(desktopRule), 'desktop workstation must remain the exact two-column split');
  const mobileStart=css.indexOf('@media(max-width:900px){');
  const mobileEnd=css.indexOf('@media(max-width:430px){');
  const mobileCss=css.slice(mobileStart,mobileEnd);
  assert(mobileStart>=0&&mobileEnd>mobileStart, 'mobile workstation media block must exist');
  assert(mobileCss.includes('#view-portfolio .sbc-quote-oe-grid-v1{grid-template-columns:minmax(0,1fr);'), 'mobile workstation must collapse to one column');
  assert(mobileCss.includes('#view-portfolio .sbc-quote-oe-grid-v1>.sbc-quote-panel-v1{grid-column:1}'), 'Quote window must occupy the single full-width mobile column');
  assert(!mobileCss.includes('grid-column:2'), 'mobile workstation must not reserve a second quote column');
  assert(!css.includes('.sbc-jr4-badge-art img'), 'workstation CSS must not take ownership of human Badge art');

  console.log('tradingWorkstationV1 acceptance: PASS');
})().catch(err=>{ console.error(err); process.exit(1); });
