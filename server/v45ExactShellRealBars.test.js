const assert = require('assert');
const vm = require('vm');
const crypto = require('crypto');
const {
  exactV45Shell,
  applyRealChartDataPatch,
  applyRealQuickTradePatch,
  REAL_BARS_PATCH_MARKER,
} = require('./v45ExactShell');

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

(async () => {
  assert(Buffer.isBuffer(exactV45Shell), 'exactV45Shell should remain a Buffer');
  const html = exactV45Shell.toString('utf8');
  assert.strictEqual((html.match(/<\/html>/g) || []).length, 1, 'shell must remain structurally intact');
  assert.strictEqual((html.split(REAL_BARS_PATCH_MARKER).length - 1), 1, 'real-bars block must be inserted exactly once');
  assert.strictEqual((html.split('const real=ensureRealBars(sym,tf);').length - 1), 1, 'generateOHLC integration must exist exactly once');
  assert(html.includes("if(real&&real.length)return real.slice(-Math.max(timeframeHistoryBars(tf),160));\n  const n=timeframeHistoryBars(tf);"), 'real bars must remain authoritative while retaining enough source history for renderer-domain pan/zoom before synthetic fallback');

  const idempotent = applyRealChartDataPatch(exactV45Shell);
  assert.strictEqual(
    crypto.createHash('sha256').update(idempotent).digest('hex'),
    crypto.createHash('sha256').update(exactV45Shell).digest('hex'),
    'reapplying patch must be byte-identical'
  );

  const blockStart = html.indexOf(REAL_BARS_PATCH_MARKER);
  const blockEnd = html.indexOf('function generateOHLC(sym,tf){', blockStart);
  assert(blockStart >= 0 && blockEnd > blockStart, 'must be able to isolate injected runtime block');
  const block = html.slice(blockStart, blockEnd);

  let fetchCalls = 0;
  let renderCalls = 0;
  const pending = [];
  const context = {
    encodeURIComponent,
    renderSymbolChart: () => { renderCalls += 1; },
    fetch: (url) => {
      fetchCalls += 1;
      return new Promise((resolve, reject) => pending.push({ url, resolve, reject }));
    },
  };
  vm.createContext(context);
  vm.runInContext(block + '\nthis.__realBarsApi={mapBarsToChartShape,ensureRealBars,realBarsCache,realBarsInFlight};', context);
  const api = context.__realBarsApi;

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(api.mapBarsToChartShape([{ open:1, high:2, low:.5, close:1.5, volume:99 }]))),
    [{ o:1, h:2, l:.5, c:1.5, v:99 }],
    'OHLCV field mapping must be exact'
  );

  assert.strictEqual(api.ensureRealBars('AAPL', 'tick'), null, 'tick timeframe must remain synthetic');
  assert.strictEqual(fetchCalls, 0, 'tick timeframe must not fetch');

  assert.strictEqual(api.ensureRealBars('AAPL', '5m'), null, 'first supported request should fall back while loading');
  assert.strictEqual(fetchCalls, 1, 'first supported request should fetch once');
  assert.strictEqual(api.ensureRealBars('AAPL', '5m'), null, 'duplicate in-flight request should still fall back');
  assert.strictEqual(fetchCalls, 1, 'duplicate in-flight request must be deduped');
  assert(pending[0].url.includes('symbol=AAPL') && pending[0].url.includes('interval=5m'), 'bars endpoint request must include symbol and timeframe');

  pending[0].resolve({ ok:true, json:async()=>({ bars:[{ open:10, high:12, low:9, close:11, volume:500 }] }) });
  await flushPromises();
  await flushPromises();
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(api.ensureRealBars('AAPL', '5m'))),
    [{ o:10, h:12, l:9, c:11, v:500 }],
    'resolved real bars must be cached in chart shape'
  );
  assert.strictEqual(fetchCalls, 1, 'cache hit must not refetch');
  assert.strictEqual(renderCalls, 1, 'successful load should trigger one chart rerender');

  assert.strictEqual(api.ensureRealBars('FAIL', '1m'), null, 'failed endpoint starts with fallback');
  assert.strictEqual(fetchCalls, 2, 'failed endpoint should attempt fetch');
  pending[1].reject(new Error('offline'));
  await flushPromises();
  await flushPromises();
  assert.strictEqual(api.ensureRealBars('FAIL', '1m'), null, 'failed endpoint must continue falling back');
  assert.strictEqual(fetchCalls, 3, 'failed endpoint must remain retryable rather than poisoning cache');

  // Primary Quick Buy / Quick Sell must submit through real backend authority.
  const quickIdempotent = applyRealQuickTradePatch(exactV45Shell);
  assert.strictEqual(
    crypto.createHash('sha256').update(quickIdempotent).digest('hex'),
    crypto.createHash('sha256').update(exactV45Shell).digest('hex'),
    'reapplying quick-trade patch must be byte-identical'
  );
  const submitStart=html.indexOf('async function submitPortfolioOrder(){');
  const submitEnd=html.indexOf('function executeOrder(p,order){',submitStart);
  assert(submitStart>=0&&submitEnd>submitStart,'must isolate patched Quick Trade submit function');
  const submitSource=html.slice(submitStart,submitEnd).trim();
  for(const required of ['workspace.submitTradeById(pid,body)','quantity:o.shares','percent:selectedTradePercent']){
    assert(submitSource.includes(required),`Quick Trade must include ${required}`);
  }
  for(const forbidden of ['executeOrder(','p.queued.push','p.history.unshift','p.cash-=','p.cash+=','p.holdings[']){
    assert(!submitSource.includes(forbidden),`Quick Trade must not retain local mutation: ${forbidden}`);
  }

  async function runQuickCase(mode,result){
    const calls=[],events=[],timers=[];
    const err={classList:{contains:()=>false,add:()=>{}},textContent:''};
    const note={className:'',textContent:''};
    const buttons={quickBuyBtn:{disabled:false},quickSellBtn:{disabled:false},submitTradeBtn:{disabled:false}};
    const quickContext={
      console,
      currentPortfolio:()=>({id:321,cash:100000,holdings:{},queued:[],history:[]}),
      proposedOrder:()=>({sym:'NVDA',shares:12.5}),
      tradeInputMode:mode,tradeSide:'buy',selectedTradePercent:75,activePortfolioContext:{mode:'live',portfolioId:321},
      window:{activePortfolioId:321,SBCWorkspacePortfolioV1:{submitTradeById:async(id,body)=>{calls.push({id,body});return result;}},dispatchEvent:e=>events.push(e)},
      document:{getElementById:id=>id==='orderError'?err:id==='quickTradeNote'?note:buttons[id]||null},
      CustomEvent:function(type,init){this.type=type;this.detail=init?.detail},
      setTimeout:fn=>{timers.push(fn);return timers.length;},
      refreshTradeTicket:()=>{},refreshQuickTrade:()=>{},String,Number
    };
    vm.createContext(quickContext);
    vm.runInContext(`${submitSource}\nthis.submitPortfolioOrder=submitPortfolioOrder;`,quickContext);
    const out=await quickContext.submitPortfolioOrder();
    timers.forEach(fn=>fn());
    return {calls,events,out,note};
  }

  const sharesCase=await runQuickCase('shares',{ok:true,symbol:'NVDA',side:'buy',quantity:12.5,price:100,queued:false});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sharesCase.calls)),[{id:321,body:{symbol:'NVDA',side:'buy',quantity:12.5}}]);
  assert.strictEqual(sharesCase.out.queued,false);

  const percentCase=await runQuickCase('percent',{ok:true,queued:true,message:'queued'});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(percentCase.calls)),[{id:321,body:{symbol:'NVDA',side:'buy',percent:75}}]);
  assert(percentCase.events.some(e=>e.type==='sbc:orders-change'),'queued Quick Trade must refresh canonical order activity');
  assert.strictEqual(percentCase.note.textContent,'queued');

  console.log('Exact V45 real chart + Quick Trade backend behavior: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
