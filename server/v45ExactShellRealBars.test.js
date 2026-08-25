const assert = require('assert');
const vm = require('vm');
const crypto = require('crypto');
const {
  exactV45Shell,
  applyRealChartDataPatch,
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
  assert(html.includes("if(real&&real.length)return real;\n  const n=timeframeBars(tf);"), 'real bars must precede the untouched synthetic fallback');

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

  console.log('Exact V45 real chart data integration behavior: PASS');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
