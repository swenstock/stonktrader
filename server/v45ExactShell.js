const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const DIR = path.join(__dirname, "v45_exact");
const TURTLE_ART_DIR = path.join(__dirname, "turtle_art_v1");
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


const LOBBY_MAIN_EVENT_LIVE_MARKET_STRIP = `<section class="quote panel">
 <div style="font-size:34px">🎟️</div>
 <div class="quote-title"><b>MAIN EVENT TICKET — LIVE MARKET</b><span>Earn one in competition or buy one from another player. Buyers can accept an Ask or place a Bid. SBC does not sell Main Event entry.</span></div>
 <div class="quotes"><div class="q bid"><span>HIGHEST BID</span><b>8,100</b></div><div class="q ask"><span>LOWEST ASK</span><b>8,500</b></div><div class="q"><span>LAST</span><b>8,350</b></div><div class="q vol"><span>24H SALES</span><b>47</b></div></div>
</section>
`;
const LOBBY_MAIN_EVENT_LIVE_MARKET_RETIREMENT_MARKER = '<!-- SBC LOBBY MAIN EVENT LIVE MARKET RETIRED V1 -->';
function applyLobbyMainEventLiveMarketRetirementPatch(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(LOBBY_MAIN_EVENT_LIVE_MARKET_RETIREMENT_MARKER)) return Buffer.from(source, "utf8");
  if (countOccurrences(source, LOBBY_MAIN_EVENT_LIVE_MARKET_STRIP) !== 1) {
    throw new Error('Exact V45 Lobby Main Event live-market retirement compatibility failure');
  }
  source = source.replace(LOBBY_MAIN_EVENT_LIVE_MARKET_STRIP, `${LOBBY_MAIN_EVENT_LIVE_MARKET_RETIREMENT_MARKER}\n`);
  if (source.includes('MAIN EVENT TICKET — LIVE MARKET')) {
    throw new Error('Exact V45 Lobby Main Event live-market retirement integrity failure');
  }
  return Buffer.from(source, "utf8");
}

// SBC LOBBY HERO LOCKED V1
const OLD_LOBBY_HERO_BLOCK = `<section class="hero">
 <div class="pitch panel">
  <img src="data:image/png;base64,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" alt="StonkBroker">
  <div class="pitch-copy">
   <h1>CAN'T AFFORD IT?<br><span>THEN WIN IT.</span></h1>
   <p>COMPETE. WIN TRANSFERABLE TICKETS.<br>EARN YOUR SHOT AT THE STONKBROKER.</p>
  </div>
 </div>
 <div class="event panel">
  <div class="event-kicker">NEXT STONKBROKER MAIN EVENT</div>
  <div class="event-title">CURRENT FUNDING</div>
  <div class="event-grid">
   <div>
    <div class="fund-head"><strong>PRIZE FUND</strong><b>78%</b></div>
    <div class="track"><div class="bar"></div></div>
    <div class="fund-meta"><span>572,000 STONK</span><span>Target: 733,332 STONK</span></div>
    <div class="usd-prize"><small>CURRENT STONKBROKER + ACTIVATION EST. USD VALUE</small><strong>$18,201</strong><span>Market estimate • not a guaranteed value</span></div>
   </div>
   <div class="prize-art"><img src="data:image/png;base64,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" alt=""><b>STONKBROKER + ACTIVATION TOKENS</b></div>
  </div>
 </div>
</section>
`;

const NEW_LOBBY_HERO_BLOCK = `<section class="hero-locked-v1">
 <div class="hero-art"><img src="/lobby-hero-turtles-office-v1.webp" alt="Stonkbroker Challenge lobby"></div>
 <div class="hero-copy">
  <h1>STONKBROKER CHALLENGE<span class="hero-tagline">RISE OF THE TURTLES</span></h1>
  <p class="hero-subtitle">PAPER TRADE. COMPETE. WIN.</p>
  <button class="action green hero-cta" onclick="showView('floor')">PLAY NOW ›</button>
  <div class="hero-cta-sub">Enter the Trading Floor</div>
 </div>
</section>
<div class="hero-locked-tagline-below">TRADE FAKE MONEY. WIN REAL TOKENIZED STOCKS.</div>
`;

const OLD_TRADING_FLOOR_ACTION_BUTTON = ` <button class="action green" onclick="showView('floor')"><span>\ud83c\udfc6 ENTER THE TRADING FLOOR<small>Pick your tier. Pick your session. Compete.</small></span><b>\u203a</b></button>
`;

const OLD_TUT_FULL_EVENT = `  {
    view:'lobby',
    target:'.event',
    title:'THE PRIZE IS ALWAYS VISIBLE',
    text:'This funding meter is the heartbeat of SBC. Qualifiers help secure the next StonkBroker Main Event before the championship starts.'
  },
`;
const OLD_TUT_FULL_ACTION = `    target:'.actions .green',
    title:'ENTER THE TRADING FLOOR',
    text:'When you want action, start here. Pick the tier you want to play — everything else comes one click later.'`;
const NEW_TUT_FULL_ACTION = `    target:'.hero-cta',
    title:'ENTER THE TRADING FLOOR',
    text:'When you want action, start here. Pick the tier you want to play — everything else comes one click later.'`;
const OLD_TUT_VIEW_EVENT = `{view:'lobby', target:'.event', title:'MAIN EVENT FUNDING', text:'Front and center: this shows how close the next StonkBroker Main Event is to being fully funded.'},\n    `;
const OLD_TUT_VIEW_ACTION = `{view:'lobby', target:'.actions .green', title:'ENTER THE TRADING FLOOR', text:'This is your main action button. Hit it when you want to choose a tier and join contests.'}`;
const NEW_TUT_VIEW_ACTION = `{view:'lobby', target:'.hero-cta', title:'ENTER THE TRADING FLOOR', text:'This is your main action button. Hit it when you want to choose a tier and join contests.'}`;

const LOBBY_HERO_LOCKED_V1_MARKER = '<!-- SBC LOBBY HERO LOCKED V1 -->';
function applyLobbyHeroLockedV1Patch(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(LOBBY_HERO_LOCKED_V1_MARKER)) return Buffer.from(source, "utf8");

  if (countOccurrences(source, OLD_LOBBY_HERO_BLOCK) !== 1) {
    throw new Error('Exact V45 lobby hero locked-v1 compatibility failure: hero block');
  }
  source = source.replace(OLD_LOBBY_HERO_BLOCK, `${LOBBY_HERO_LOCKED_V1_MARKER}\n${NEW_LOBBY_HERO_BLOCK}`);

  if (countOccurrences(source, OLD_TRADING_FLOOR_ACTION_BUTTON) !== 1) {
    throw new Error('Exact V45 lobby hero locked-v1 compatibility failure: trading-floor action button');
  }
  source = source.replace(OLD_TRADING_FLOOR_ACTION_BUTTON, '');

  if (countOccurrences(source, OLD_TUT_FULL_EVENT) !== 1) {
    throw new Error('Exact V45 lobby hero locked-v1 compatibility failure: FULL_TUTORIAL_STEPS .event entry');
  }
  source = source.replace(OLD_TUT_FULL_EVENT, '');

  if (countOccurrences(source, OLD_TUT_FULL_ACTION) !== 1) {
    throw new Error('Exact V45 lobby hero locked-v1 compatibility failure: FULL_TUTORIAL_STEPS .actions .green entry');
  }
  source = source.replace(OLD_TUT_FULL_ACTION, NEW_TUT_FULL_ACTION);

  if (countOccurrences(source, OLD_TUT_VIEW_EVENT) !== 1) {
    throw new Error('Exact V45 lobby hero locked-v1 compatibility failure: VIEW_TUTORIALS.lobby .event entry');
  }
  source = source.replace(OLD_TUT_VIEW_EVENT, '');

  if (countOccurrences(source, OLD_TUT_VIEW_ACTION) !== 1) {
    throw new Error('Exact V45 lobby hero locked-v1 compatibility failure: VIEW_TUTORIALS.lobby .actions .green entry');
  }
  source = source.replace(OLD_TUT_VIEW_ACTION, NEW_TUT_VIEW_ACTION);

  if (source.includes("CAN'T AFFORD IT")
    || countOccurrences(source, "class=\"action green\" onclick=\"showView('floor')\"") !== 0
    || countOccurrences(source, "target:'.event'") !== 0
    || countOccurrences(source, "target:'.actions .green'") !== 0) {
    throw new Error('Exact V45 lobby hero locked-v1 integrity failure');
  }
  return Buffer.from(source, "utf8");
}

const STATIC_LEADER_POSITION_CARD = `      <div class="leader-find-identity">
        <span class="find-kicker">YOUR POSITION</span>
        <b id="leaderYourRank">#31 / 224</b>
        <span id="leaderYourPnl">+6.84%</span>
      </div>

`;
const STATIC_LEADER_POSITION_RETIREMENT_MARKER = '<!-- SBC STATIC LEADER POSITION RETIRED V1 -->';
function applyStaticLeaderPositionRetirementPatch(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(STATIC_LEADER_POSITION_RETIREMENT_MARKER)) return Buffer.from(source, "utf8");
  if (countOccurrences(source, STATIC_LEADER_POSITION_CARD) !== 1) {
    throw new Error('Exact V45 static leader position retirement compatibility failure');
  }
  source = source.replace(STATIC_LEADER_POSITION_CARD, `      ${STATIC_LEADER_POSITION_RETIREMENT_MARKER}\n`);
  const staleLeaderWrites = `  document.getElementById('leaderYourRank').textContent=\`#\${s.rank} / \${s.entries}\`;\n  document.getElementById('leaderYourPnl').textContent=\`+\${s.userPnl.toFixed(2)}%\`;\n`;
  if (countOccurrences(source, staleLeaderWrites) !== 1) {
    throw new Error('Exact V45 static leader position retirement compatibility failure: stale leader writes');
  }
  source = source.replace(staleLeaderWrites, '  /* retired static leader identity writes */\n');
  if (source.includes('YOUR POSITION') || source.includes('id="leaderYourRank"') || source.includes('id="leaderYourPnl"')) {
    throw new Error('Exact V45 static leader position retirement integrity failure');
  }
  return Buffer.from(source, "utf8");
}

const TURTLE_TIER_ART_KEYS = ['freeroll','runner','clerk','trader','junior'];
function turtleTierArtDataUri(key) {
  if (!TURTLE_TIER_ART_KEYS.includes(key)) throw new Error(`Unknown turtle tier art key: ${key}`);
  return `data:image/png;base64,${fs.readFileSync(path.join(TURTLE_ART_DIR, `${key}.png`)).toString('base64')}`;
}
function applyTurtleTierArtPatch(html) {
  let source = Buffer.isBuffer(html) ? html.toString('utf8') : String(html);
  const tierStart = source.indexOf('const TIER_DATA = {');
  if (tierStart < 0) throw new Error('Exact V45 turtle art patch compatibility failure: TIER_DATA missing');
  const tierEnd = source.indexOf(';\n', tierStart);
  if (tierEnd <= tierStart) throw new Error('Exact V45 turtle art patch compatibility failure: TIER_DATA terminator missing');
  let block = source.slice(tierStart, tierEnd);
  for (let i = 0; i < TURTLE_TIER_ART_KEYS.length; i += 1) {
    const key = TURTLE_TIER_ART_KEYS[i];
    const next = TURTLE_TIER_ART_KEYS[i + 1];
    const keyAnchor = `"${key}":`;
    const start = block.indexOf(keyAnchor);
    const end = next ? block.indexOf(`"${next}":`, start + keyAnchor.length) : block.length;
    if (start < 0 || end <= start) throw new Error(`Exact V45 turtle art patch compatibility failure: ${key}`);
    const segment = block.slice(start, end);
    const artPattern = /"art":\s*"data:image\/png;base64,[^"]+"/g;
    const matches = segment.match(artPattern) || [];
    if (matches.length !== 1) throw new Error(`Exact V45 turtle art patch integrity failure: ${key} art fields=${matches.length}`);
    const replaced = segment.replace(artPattern, `"art": "${turtleTierArtDataUri(key)}"`);
    block = block.slice(0, start) + replaced + block.slice(end);
  }
  source = source.slice(0, tierStart) + block + source.slice(tierEnd);
  for (const key of TURTLE_TIER_ART_KEYS) {
    const cardAnchor = `id="cleanCard-${key}"`;
    const cardStart = source.indexOf(cardAnchor);
    const cardEnd = source.indexOf('</article>', cardStart);
    if (cardStart < 0 || cardEnd <= cardStart) throw new Error(`Exact V45 turtle floor-card compatibility failure: ${key}`);
    const card = source.slice(cardStart, cardEnd);
    const imagePattern = /<img\s+src="data:image\/png;base64,[^"]+"/g;
    const matches = card.match(imagePattern) || [];
    if (matches.length !== 1) throw new Error(`Exact V45 turtle floor-card integrity failure: ${key} images=${matches.length}`);
    const replaced = card.replace(imagePattern, `<img src="${turtleTierArtDataUri(key)}"`);
    source = source.slice(0, cardStart) + replaced + source.slice(cardEnd);
  }
  return Buffer.from(source, 'utf8');
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

const CHART_PRESENTATION_TUNING_MARKER = '/* SBC CHART PRESENTATION TUNING V1 */';
function applyChartPresentationTuning(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(CHART_PRESENTATION_TUNING_MARKER)) return Buffer.from(source, "utf8");
  const replacements = [
    ["function timeframeBars(tf){\n  return tf==='tick'?70:tf==='1m'?60:tf==='5m'?60:tf==='15m'?52:tf==='1h'?48:40;\n}", "/* SBC CHART PRESENTATION TUNING V1 */\nfunction timeframeBars(tf){\n  return tf==='tick'?46:tf==='1m'?44:tf==='5m'?42:tf==='15m'?40:tf==='1h'?36:32;\n}\nfunction timeframeHistoryBars(tf){ return timeframeBars(tf)*5; }"],
    ["if(real&&real.length)return real;", "if(real&&real.length)return real.slice(-Math.max(timeframeHistoryBars(tf),160));"],
    ["  const n=timeframeBars(tf);", "  const n=timeframeHistoryBars(tf);"],
    ["  const data=generateOHLC(sym,chartPrefs.timeframe);", "  const fullData=generateOHLC(sym,chartPrefs.timeframe);\n  const viewportState=window.SBCChartViewportV50?.state||{};\n  const timeZoom=Math.max(.5,Math.min(3,Number(viewportState.x||1)));\n  const baseVisible=timeframeBars(chartPrefs.timeframe);\n  const visibleCount=Math.max(10,Math.min(fullData.length,Math.round(baseVisible/timeZoom)));\n  const maxOffset=Math.max(0,fullData.length-visibleCount);\n  const panBars=Math.max(0,Math.min(maxOffset,Math.round(Number(viewportState.pan||0))));\n  const end=Math.max(visibleCount,fullData.length-panBars);\n  const data=fullData.slice(Math.max(0,end-visibleCount),end);"],
    ["  const xStep=(w-padL-padR)/data.length;", "  const xStep=(w-padL-padR)/data.length;\n  const dragOffsetX=Number(viewportState.dragPx||0);"],
    ["    ${grid}\n    ${priceVisual}\n    ${overlays}\n    ${crosshair}\n    ${chartPrefs.volume?`<line class=\"chart-grid-line\" x1=\"${padL}\" y1=\"${h-padB-volH-5}\" x2=\"${w-padR}\" y2=\"${h-padB-volH-5}\"/>${volumes}`:''}", "    <defs><clipPath id=\"sbcPlotClipV1\"><rect x=\"${padL}\" y=\"${padT}\" width=\"${w-padL-padR}\" height=\"${h-padT-padB}\"/></clipPath></defs>\n    ${grid}\n    <g class=\"sbc-plot-body-v1\" clip-path=\"url(#sbcPlotClipV1)\" transform=\"translate(${dragOffsetX} 0)\">\n      ${priceVisual}\n      ${overlays}\n      ${crosshair}\n      ${chartPrefs.volume?`${volumes}`:''}\n    </g>\n    ${chartPrefs.volume?`<line class=\"chart-grid-line\" x1=\"${padL}\" y1=\"${h-padB-volH-5}\" x2=\"${w-padR}\" y2=\"${h-padB-volH-5}\"/>`:''}"],
    ["const volH=chartPrefs.volume?72:0;", "const volH=chartPrefs.volume?50:0;"],
    ["const candleW=Math.max(2,Math.min(8,xStep*.62));", "const candleW=Math.max(3,Math.min(11,xStep*.72));"],
    ["stroke-width=\"1\"", "stroke-width=\"1.15\""],
    ["  const hi=Math.max(...data.map(d=>d.h));\n  const lo=Math.min(...data.map(d=>d.l));\n  const range=(hi-lo)||1;", "  const dataHi=Math.max(...data.map(d=>d.h));\n  const dataLo=Math.min(...data.map(d=>d.l));\n  const dataRange=(dataHi-dataLo)||1;\n  const priceZoom=Math.max(.5,Math.min(3,Number(window.SBCChartViewportV50?.state?.y||1)));\n  const priceCenter=(dataHi+dataLo)/2;\n  const range=(dataRange*1.12)/priceZoom;\n  const hi=priceCenter+range/2;\n  const lo=priceCenter-range/2;"],
  ];
  for (const [from,to] of replacements) {
    if (!source.includes(from)) throw new Error(`Exact V45 chart presentation tuning compatibility failure: ${from}`);
    source = source.replace(from,to);
  }
  return Buffer.from(source,"utf8");
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
  return applySessionUiTruthV1Patch(applyLobbyHeroLockedV1Patch(applyLobbyMainEventLiveMarketRetirementPatch(applyStaticLeaderPositionRetirementPatch(applyTurtleTierArtPatch(applyChartPresentationTuning(applyLegacyOrdersSurfaceRetirementPatch(applyRealQuickTradePatch(applyRealChartDataPatch(html)))))))));
}



// SBC SESSION UI TRUTH V1
// Replaces the derivation of PLAY NOW/RESERVE NOW inside renderSessions()/openTier()
// with backend-driven state from /api/satellites, via public/session-ui-truth-v1.js
// and public/v45-backend-authority-v1.js (both loaded as separate <script> tags,
// see server/previewServer.js and server/index.js). SESSION_UI and sessionUI(name)
// in the base shell are deliberately left untouched -- openStandingModal() still
// depends on sessionUI() for its (unrelated, cosmetic) youRank/youPnl/cashRank/
// cashPnl/gap fields, which have nothing to do with open/reserve status.
const OLD_OPEN_TIER_BLOCK = `function openTier(key){
 const t=TIER_DATA[key];
 document.getElementById('tierArt').src=t.art;
 document.getElementById('tierName').textContent=t.name+' LOBBY';
 document.getElementById('tierTag').textContent=t.tag;
 document.getElementById('tierTag').style.color=t.accent;
 document.getElementById('tierDesc').textContent=t.desc;
 document.getElementById('tierPrice').textContent=t.price===0?'FREE':t.price.toLocaleString()+' STONK';
 document.getElementById('tierUsd').textContent=t.price===0?'Zero-risk entry':'≈ '+t.usd+' at current reference';
 currentTierKey=key;
 currentEventId='morning';
 renderSessions(key);
 showView('tier');
}`;

const NEW_OPEN_TIER_BLOCK = `async function openTier(key){
 const t=TIER_DATA[key];
 document.getElementById('tierArt').src=t.art;
 document.getElementById('tierName').textContent=t.name+' LOBBY';
 document.getElementById('tierTag').textContent=t.tag;
 document.getElementById('tierTag').style.color=t.accent;
 document.getElementById('tierDesc').textContent=t.desc;
 document.getElementById('tierPrice').textContent=t.price===0?'FREE':t.price.toLocaleString()+' STONK';
 document.getElementById('tierUsd').textContent=t.price===0?'Zero-risk entry':'\\u2248 '+t.usd+' at current reference';
 currentTierKey=key;
 currentEventId='morning';
 showView('tier');
 renderSessions(key, null);
 const categories = await window.SBCSessionUiTruthV1.fetchSatelliteLevels(window.SBCBackendAuthorityV1);
 renderSessions(key, categories);
}`;

const OLD_RENDER_SESSIONS_BLOCK = `function renderSessions(key){
  const t=TIER_DATA[key];
  const grid=document.getElementById('sessionGrid');
  const visibleSessions=SESSIONS.filter(s=>!(key==='freeroll' && s.name==='DEGEN RACE TO THE CLOSE'));
  grid.innerHTML=visibleSessions.map((s,i)=>{
   const e=Math.max(12,Math.round(s.entries*(key==='freeroll'?2.2:key==='runner'?1.5:key==='clerk'?1:key==='trader'?.55:.28)));
   const price=t.price===0?'FREE':t.price.toLocaleString()+' STONK';
   const special=s.format==='Degen'?' degen':'';
   const live=s.status==='LIVE'?' live':'';
   const ui=sessionUI(s.name);
   const playNow=ui.mode==='play';
   return \`<article class="session panel">
     <div class="session-icon">\${s.icon}</div>
     <div>
       <h3>\${s.name}</h3>
       <p>\${s.time}</p>
       <div class="session-meta">
         <span class="pill\${live}">\${s.status}</span>
         <span class="pill\${special}">\${s.format.toUpperCase()}</span>
         <span class="pill">\${e.toLocaleString()} ENTRIES</span>
       </div>
       <div class="session-time-row">
         <span class="time-chip \${playNow?'play':'reserve'}">\${playNow ? ('PLAY NOW • ' + (ui.ends || 'LIVE')) : 'RESERVE NOW'}</span>
         <span class="session-time-copy">\${ui.start}</span>
       </div>
       <div class="session-preview \${playNow?'live-preview':''}">
         <b>\${ui.previewTitle}</b>
         <span>\${ui.previewText}</span>
       </div>
     </div>
     <div class="session-side">
       <div class="session-right">
         <strong>\${price}</strong>
         <span>\${t.price===0?'FREE':t.usd}</span>
         <button onclick="event.stopPropagation();beginPortfolioFlow('\${s.name}','\${key}','\${playNow?'live':'reserve'}','tier',1)">\${ui.button}</button>
       </div>
       \${playNow ? \`<button class="secondary" onclick="event.stopPropagation();openStandingModal('\${s.name}','\${t.name}')">CURRENT STANDING</button>
       <button class="secondary" onclick="event.stopPropagation();showView('leaders')">LEADERBOARD</button>\` : \`\`}
     </div>
   </article>\`
  }).join('');
}`;

const NEW_RENDER_SESSIONS_BLOCK = `function renderSessions(key, categories){
 const t=TIER_DATA[key];
 const grid=document.getElementById('sessionGrid');
 const visibleSessions=SESSIONS.filter(s=>!(key==='freeroll' && s.name==='DEGEN RACE TO THE CLOSE'));
 grid.innerHTML=visibleSessions.map((s,i)=>{
  const e=Math.max(12,Math.round(s.entries*(key==='freeroll'?2.2:key==='runner'?1.5:key==='clerk'?1:key==='trader'?.55:.28)));
  const price=t.price===0?'FREE':t.price.toLocaleString()+' STONK';
  const special=s.format==='Degen'?' degen':'';
  const level=window.SBCSessionUiTruthV1.findLevel(categories, s.name, key, window.SBCBackendAuthorityV1);
  const live=level?.status==='open'?' live':'';
  const ui=window.SBCSessionUiTruthV1.sessionUIFromBackend(level);
  const playNow=ui.mode==='play';
  return \`<article class="session panel">
    <div class="session-icon">\${s.icon}</div>
    <div>
      <h3>\${s.name}</h3>
      <p>\${s.time}</p>
      <div class="session-meta">
        <span class="pill\${live}">\${level?.status?.toUpperCase() || s.status}</span>
        <span class="pill\${special}">\${s.format.toUpperCase()}</span>
        <span class="pill">\${e.toLocaleString()} ENTRIES</span>
      </div>
      <div class="session-time-row">
        <span class="time-chip \${playNow?'play':'reserve'}">\${playNow ? ('PLAY NOW \\u2022 ' + (ui.ends || 'LIVE')) : ui.button}</span>
        <span class="session-time-copy">\${ui.start}</span>
      </div>
      <div class="session-preview \${playNow?'live-preview':''}">
        <b>\${ui.previewTitle}</b>
        <span>\${ui.previewText}</span>
      </div>
    </div>
    <div class="session-side">
      <div class="session-right">
        <strong>\${price}</strong>
        <span>\${t.price===0?'FREE':t.usd}</span>
        <button onclick="event.stopPropagation();beginPortfolioFlow('\${s.name}','\${key}','\${playNow?'live':'reserve'}','tier',1)">\${ui.button}</button>
      </div>
      \${playNow ? \`<button class="secondary" onclick="event.stopPropagation();openStandingModal('\${s.name}','\${t.name}')">CURRENT STANDING</button>
      <button class="secondary" onclick="event.stopPropagation();showView('leaders')">LEADERBOARD</button>\` : \`\`}
    </div>
  </article>\`
 }).join('');
}`;

const SESSION_UI_TRUTH_V1_MARKER = '<!-- SBC SESSION UI TRUTH V1 -->';
function applySessionUiTruthV1Patch(html) {
  let source = Buffer.isBuffer(html) ? html.toString("utf8") : String(html);
  if (source.includes(SESSION_UI_TRUTH_V1_MARKER)) return Buffer.from(source, "utf8");

  if (countOccurrences(source, OLD_RENDER_SESSIONS_BLOCK) !== 1) {
    throw new Error('Exact V45 session-ui-truth-v1 compatibility failure: renderSessions block');
  }
  source = source.replace(OLD_RENDER_SESSIONS_BLOCK, NEW_RENDER_SESSIONS_BLOCK);

  if (countOccurrences(source, OLD_OPEN_TIER_BLOCK) !== 1) {
    throw new Error('Exact V45 session-ui-truth-v1 compatibility failure: openTier block');
  }
  source = source.replace(OLD_OPEN_TIER_BLOCK, `${SESSION_UI_TRUTH_V1_MARKER}\n${NEW_OPEN_TIER_BLOCK}`);

  return Buffer.from(source, "utf8");
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
  applyChartPresentationTuning,
  CHART_PRESENTATION_TUNING_MARKER,
  applyTurtleTierArtPatch,
  TURTLE_TIER_ART_KEYS,
  applyStaticLeaderPositionRetirementPatch,
  STATIC_LEADER_POSITION_RETIREMENT_MARKER,
  applyLobbyMainEventLiveMarketRetirementPatch,
  LOBBY_MAIN_EVENT_LIVE_MARKET_RETIREMENT_MARKER,
  applyLobbyHeroLockedV1Patch,
  LOBBY_HERO_LOCKED_V1_MARKER,
  applySessionUiTruthV1Patch,
  SESSION_UI_TRUTH_V1_MARKER,
};