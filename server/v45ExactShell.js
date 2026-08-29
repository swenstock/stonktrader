const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const DIR = path.join(__dirname, "v45_exact");
const EXPECTED_BYTES = 407262;
const EXPECTED_SHA256 = "06b85e828cb2404b830c648f0d6f3f5832ad15826ffd6f8446700c2683c7d669";

const REAL_BARS_PATCH_MARKER = "const REAL_BARS_SUPPORTED_TF = new Set(['1m','5m','15m','1h','1D']);";
const GENERATE_OHLC_ANCHOR = "function generateOHLC(sym,tf){";
const REAL_BARS_PATCH_BLOCK = [
  "// Real market data integration. 'tick' has no server-side equivalent, so it",
  "// intentionally always uses the synthetic generator below - everything",
  "// else prefers real bars from the same simulated-quote engine the rest of",
  "// the platform already uses, falling back to the exact original synthetic",
  "// behavior whenever real data isn't ready yet or the fetch fails. This",
  "// fallback is not a temporary measure - it's how the chart stays working",
  "// even if the bars endpoint is ever slow or unreachable.",
  "const REAL_BARS_SUPPORTED_TF = new Set(['1m','5m','15m','1h','1D']);",
  "const realBarsCache = {};",
  "const realBarsInFlight = {};",
  "function mapBarsToChartShape(bars){ return bars.map(b=>({o:b.open,h:b.high,l:b.low,c:b.close,v:b.volume})); }",
  "function ensureRealBars(sym,tf){",
  "  if(!REAL_BARS_SUPPORTED_TF.has(tf))return null;",
  "  const key=sym+':'+tf;",
  "  if(realBarsCache[key])return realBarsCache[key];",
  "  if(!realBarsInFlight[key]){",
  "    realBarsInFlight[key]=fetch(`/api/quotes/bars?symbol=${encodeURIComponent(sym)}&interval=${tf}`)",
  "      .then(r=>{ if(!r.ok)throw new Error('bars fetch failed'); return r.json(); })",
  "      .then(d=>{ realBarsCache[key]=mapBarsToChartShape(d.bars); delete realBarsInFlight[key];",
  "        if(typeof renderSymbolChart==='function')renderSymbolChart(); })",
  "      .catch(()=>{ delete realBarsInFlight[key]; });",
  "  }",
  "  return null;",
  "}",
  "",
].join("\n");

function read(name) {
  return fs.readFileSync(path.join(DIR, name), "utf8").trim();
}

function repairedChunk(index) {
  const n = String(index).padStart(2, "0");
  if (index === 6) {
    return read("fix06_0.b64")
      + read("fix06_1_0.b64") + read("fix06_1_1.b64") + read("fix06_1_2.b64")
      + read("fix06_1_3a.b64") + read("fix06_1_3b.b64")
      + read("fix06_2.b64");
  }
  if ([17, 18, 22].includes(index)) {
    return read(`fix${n}_0.b64`) + read(`fix${n}_1.b64`) + read(`fix${n}_2.b64`);
  }
  return read(`s${n}.b64`);
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const LEGACY_ORDERS_SURFACE_PATCH_MARKER = '<!-- SBC MODERN ORDERS SURFACE V1 -->';
const LEGACY_ORDERS_BLOCK = `    <div class="bottom-trade-grid">
      <section class="queue-card panel">
        <div class="card-head"><h2 id="queueTitle">QUEUED ORDERS</h2><span id="queueSubtitle">Orders waiting for session open</span></div>
        <div id="queuedOrders" class="order-list"></div>
      </section>
      <section class="history-card panel">
        <div class="card-head"><h2>RECENT ACTIVITY</h2><span>Trades and portfolio changes</span></div>
        <div id="tradeHistory" class="order-list"></div>
      </section>
    </div>`;
const MODERN_ORDERS_BLOCK = `    <!-- SBC MODERN ORDERS SURFACE V1 -->
    <div class="bottom-trade-grid">
      <section class="queue-card orders-activity-card panel">
        <div class="card-head"><h2>ORDERS & ACTIVITY</h2><span>Real queued orders, working orders, fills and cancellations</span></div>
        <span id="queueTitle" hidden>ORDER QUEUE</span>
        <span id="queueSubtitle" hidden>Real backend orders</span>
      </section>
    </div>`;

function applyLegacyOrdersSurfaceRetirementPatch(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(LEGACY_ORDERS_SURFACE_PATCH_MARKER)) return Buffer.from(source, "utf8");
  if (!source.includes(LEGACY_ORDERS_BLOCK)) throw new Error('Exact V45 legacy orders surface patch compatibility failure');
  source = source.replace(LEGACY_ORDERS_BLOCK, MODERN_ORDERS_BLOCK);
  const portfolioStart=source.indexOf('function renderPortfolio(){');
  const portfolioEnd=source.indexOf('function renderHoldings(){',portfolioStart);
  if(portfolioStart<0||portfolioEnd<0)throw new Error('Exact V45 renderPortfolio patch compatibility failure');
  let block=source.slice(portfolioStart,portfolioEnd);
  block=block.replace('  renderQueuedOrders();\n  renderTradeHistory();\n','');
  if(block.includes('renderQueuedOrders();')||block.includes('renderTradeHistory();'))throw new Error('Exact V45 legacy orders render calls retained');
  source=source.slice(0,portfolioStart)+block+source.slice(portfolioEnd);
  if(source.includes('id="queuedOrders"')||source.includes('id="tradeHistory"'))throw new Error('Exact V45 legacy order DOM ids retained');
  return Buffer.from(source,'utf8');
}

const QUICK_TRADE_ORDER_ANCHOR = "function quickTradeOrder(side){";
const QUICK_TRADE_SUBMIT_ANCHOR = "function submitPortfolioOrder(){";
const QUICK_TRADE_EXECUTE_ANCHOR = "function executeOrder(p,order){";

function replaceFunctionBlock(source, startAnchor, nextAnchor, replacement) {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(nextAnchor, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Exact V45 quick-trade patch compatibility failure: ${startAnchor}`);
  }
  return source.slice(0, start) + replacement + "\n\n" + source.slice(end);
}

function applyRealQuickTradePatch(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes("/* SBC REAL QUICK TRADE V1 */")) return Buffer.from(source, "utf8");

  const quickReplacement = [
    "/* SBC REAL QUICK TRADE V1 */",
    "async function quickTradeOrder(side){",
    "  const preview=quickOrderPreview(side);",
    "  if(!preview.valid){ refreshQuickTrade(); return; }",
    "  tradeSide=side;",
    "  setTradeSide(side);",
    "  if(tradeInputMode==='percent')selectedTradePercent=quickTradePercent;",
    "  refreshTradeTicket();",
    "  const err=document.getElementById('orderError');",
    "  if(err?.classList.contains('show')){ refreshQuickTrade(); return; }",
    "  await submitPortfolioOrder();",
    "  refreshQuickTrade();",
    "}"
  ].join("\n");

  const submitReplacement = [
    "async function submitPortfolioOrder(){",
    "  const p=currentPortfolio(),o=proposedOrder();",
    "  const err=document.getElementById('orderError');",
    "  if(err?.classList.contains('show'))return null;",
    "  const workspace=window.SBCWorkspacePortfolioV1;",
    "  if(!workspace?.submitTradeById){",
    "    if(err){err.textContent='Real trading connection is unavailable. Refresh and try again.';err.classList.add('show');}",
    "    return null;",
    "  }",
    "  const pid=Number(p?.id||p?.portfolioId||activePortfolioContext?.portfolioId||activePortfolioContext?.portfolio_id||window.activePortfolioId||0);",
    "  if(!(pid>0)){",
    "    if(err){err.textContent='A real backend portfolio is required to trade.';err.classList.add('show');}",
    "    return null;",
    "  }",
    "  const body=tradeInputMode==='shares'",
    "    ? {symbol:o.sym,side:tradeSide,quantity:o.shares}",
    "    : {symbol:o.sym,side:tradeSide,percent:selectedTradePercent};",
    "  const buyBtn=document.getElementById('quickBuyBtn'),sellBtn=document.getElementById('quickSellBtn'),submit=document.getElementById('submitTradeBtn');",
    "  if(buyBtn)buyBtn.disabled=true;if(sellBtn)sellBtn.disabled=true;if(submit)submit.disabled=true;",
    "  try{",
    "    const result=await workspace.submitTradeById(pid,body);",
    "    window.dispatchEvent?.(new CustomEvent('sbc:quick-trade-result',{detail:{portfolioId:pid,result,body}}));",
    "    if(result?.queued)window.dispatchEvent?.(new CustomEvent('sbc:orders-change',{detail:{portfolioId:pid,source:'quick-trade'}}));",
    "    const note=document.getElementById('quickTradeNote');",
    "    setTimeout(()=>{",
    "      try{refreshTradeTicket();refreshQuickTrade();}catch(_){}",
    "      if(note){note.className='quick-trade-note good';note.textContent=result?.queued?(result.message||'Order queued for the next eligible market open.'):(result?.side?(String(result.side).toUpperCase()+' '+result.symbol+' filled at $'+Number(result.price||0).toFixed(2)+'.'):'Order filled.');}",
    "    },180);",
    "    return result;",
    "  }catch(e){",
    "    if(err){err.textContent=e?.message||String(e);err.classList.add('show');}",
    "    return null;",
    "  }finally{",
    "    if(buyBtn)buyBtn.disabled=false;if(sellBtn)sellBtn.disabled=false;if(submit)submit.disabled=false;",
    "  }",
    "}"
  ].join("\n");

  source = replaceFunctionBlock(source, QUICK_TRADE_ORDER_ANCHOR, "function setTradePercent(pct){", quickReplacement);
  source = replaceFunctionBlock(source, QUICK_TRADE_SUBMIT_ANCHOR, QUICK_TRADE_EXECUTE_ANCHOR, submitReplacement);

  const submitStart=source.indexOf('async function submitPortfolioOrder(){');
  const submitEnd=source.indexOf(QUICK_TRADE_EXECUTE_ANCHOR,submitStart);
  const submitBlock=source.slice(submitStart,submitEnd);
  const required=["workspace.submitTradeById(pid,body)","quantity:o.shares","percent:selectedTradePercent","sbc:quick-trade-result"];
  for(const token of required){if(!submitBlock.includes(token))throw new Error(`Exact V45 real quick-trade patch integrity failure: ${token}`);}
  const forbidden=['executeOrder(','p.queued.push','p.history.unshift','p.cash-=','p.cash+=','p.holdings['];
  for(const token of forbidden){if(submitBlock.includes(token))throw new Error(`Exact V45 real quick-trade patch retained local mutation: ${token}`);}
  return Buffer.from(source,"utf8");
}

function applyRealChartDataPatch(html) {
  const source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(REAL_BARS_PATCH_MARKER)) return Buffer.from(source, "utf8");

  const required = [GENERATE_OHLC_ANCHOR, "function timeframeBars", "function renderSymbolChart"];
  for (const token of required) {
    if (countOccurrences(source, token) !== 1) {
      throw new Error(`Exact V45 real-bars patch compatibility failure: expected one ${token}`);
    }
  }

  let patched = source.replace(GENERATE_OHLC_ANCHOR, REAL_BARS_PATCH_BLOCK + GENERATE_OHLC_ANCHOR);
  patched = patched.replace(
    GENERATE_OHLC_ANCHOR,
    GENERATE_OHLC_ANCHOR + "\n  const real=ensureRealBars(sym,tf);\n  if(real&&real.length)return real;"
  );

  if (countOccurrences(patched, REAL_BARS_PATCH_MARKER) !== 1 || countOccurrences(patched, "const real=ensureRealBars(sym,tf);") !== 1) {
    throw new Error("Exact V45 real-bars patch integrity failure");
  }
  if (countOccurrences(patched, "</html>") !== 1) {
    throw new Error("Exact V45 real-bars patch structural failure");
  }
  return Buffer.from(patched, "utf8");
}

function buildExactV45Shell() {
  const chunks = [];
  for (let i = 0; i <= 23; i += 1) chunks.push(repairedChunk(i));
  chunks.push(read("fix24_0.b64") + read("fix24_1.b64"));
  const gzip = Buffer.from(chunks.join(""), "base64");
  const html = zlib.gunzipSync(gzip);
  const sha256 = crypto.createHash("sha256").update(html).digest("hex");
  if (html.length !== EXPECTED_BYTES || sha256 !== EXPECTED_SHA256) {
    throw new Error(`Exact V45 integrity failure: ${html.length} bytes ${sha256}`);
  }
  return applyLegacyOrdersSurfaceRetirementPatch(applyRealQuickTradePatch(applyRealChartDataPatch(html)));
}

const exactV45Shell = buildExactV45Shell();

module.exports = {
  exactV45Shell,
  EXPECTED_BYTES,
  EXPECTED_SHA256,
  applyRealChartDataPatch,
  applyRealQuickTradePatch,
  REAL_BARS_PATCH_MARKER,
  applyLegacyOrdersSurfaceRetirementPatch,
  LEGACY_ORDERS_SURFACE_PATCH_MARKER,
};
