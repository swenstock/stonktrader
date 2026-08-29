const assert=require('assert');
const fs=require('fs');
const {normalizeTimeframe,priceWheelFactor,boundedLogicalRange,mapApiBars,smaData,emaData}=require('../public/v45-mature-chart-owner-v1.js');

assert.strictEqual(normalizeTimeframe('1H'),'1h');
assert.strictEqual(normalizeTimeframe('1D'),'1D');
assert(priceWheelFactor(1,120)>1,'positive price-axis wheel delta must expand price range');
assert(priceWheelFactor(1,-120)<1,'negative price-axis wheel delta must compress price range');
const rightBlank=boundedLogicalRange({from:130,to:170},120);
assert(rightBlank.from<=111,'aggressive right pan must leave real bars visible');
assert.strictEqual(Number((rightBlank.to-rightBlank.from).toFixed(6)),40,'viewport clamp must preserve time span');
const leftBlank=boundedLogicalRange({from:-70,to:-30},120);
assert(leftBlank.to>=7,'aggressive left pan must leave real bars visible');
assert.strictEqual(Number((leftBlank.to-leftBlank.from).toFixed(6)),40,'left clamp must preserve time span');
assert.deepStrictEqual(boundedLogicalRange({from:70,to:110},120),{from:70,to:110},'valid manual viewport must remain untouched');
const bars=mapApiBars([
  {time:'2026-08-28T14:30:00Z',open:100,high:102,low:99,close:101,volume:1000},
  {time:'2026-08-28T14:31:00Z',open:101,high:103,low:100,close:102,volume:1100},
]);
assert.strictEqual(bars.length,2);
assert.strictEqual(smaData(bars,2).length,1);
assert.strictEqual(emaData(bars,2).length,2);

const client=fs.readFileSync('public/v45-mature-chart-owner-v1.js','utf8');
const sync=fs.readFileSync('public/v45-active-symbol-sync-v1.js','utf8');
const stage45=fs.readFileSync('public/v45-desktop-stage45-v50.js','utf8');
const server=fs.readFileSync('server/index.js','utf8');
assert(client.includes('window.LightweightCharts.createChart'),'visible chart must be owned by vendored Lightweight Charts');
assert(client.includes("handleScroll:{mouseWheel:false,pressedMouseMove:true"),'plot drag must be native library panning and wheel must be reserved for scale');
assert(client.includes("handleScale:{mouseWheel:true"),'plot wheel must use native time-scale zoom');
assert(client.includes("kineticScroll:{mouse:false,touch:true}"),'desktop mouse pan must stop exactly on release with no inertial drift');
assert(client.includes("if(x>=r.width-72)"),'right price-axis wheel must have an independent interaction zone');
assert(client.includes('ts.getVisibleLogicalRange()')&&client.includes('boundedLogicalRange(prior,bars.length)'),'data refresh must preserve a bounded manually moved viewport');
assert(client.includes('subscribeVisibleLogicalRangeChange(enforceViewportBounds)'),'native panning must be bounded at the chart owner rather than by a second gesture layer');
assert(client.includes('function viewportReady(v)')&&client.includes('!c||!v||!viewportReady(v)'),'hidden/zero-size workspaces must not own a mature chart yet');
assert(client.includes('requestAnimationFrame(()=>requestAnimationFrame(ensureMounted))'),'workspace view transitions must wait for layout before chart ownership');
assert(client.includes("window.addEventListener('sbc:active-symbol-change'"),'chart must subscribe to canonical symbol events');
assert(!client.includes('window.chartSymbol')&&!client.includes('window.selectedSymbol')&&!client.includes('window.activeSymbol'),'dead global symbol guessing must be removed');
assert(!client.includes('setInterval(()=>{install')&&!client.includes('setInterval(()=>ensureMounted'),'chart owner must not poll/remount the DOM');
assert(sync.includes("window.selectChartSymbol=wrapped"),'existing selectChartSymbol must remain the canonical setter seam');
assert(sync.includes("new CustomEvent('sbc:active-symbol-change'"),'canonical setter must publish explicit active-symbol events');
assert(sync.includes('function guardMatureStyleClick(e)'),'mature style controls must be intercepted before legacy chart style handlers');
assert(sync.includes('preferredStyle=style;applyPreferredStyle()'),'Candles/Line controls must persist the selected mature chart style');
assert(sync.includes('state.chartType=preferredStyle')&&sync.includes("state.candles.applyOptions({visible:preferredStyle==='candles'})")&&sync.includes("state.line.applyOptions({visible:preferredStyle==='line'})"),'preferred style must directly control the mature candlestick and line series');
assert(sync.includes('reapplyPreferredStyle()'),'timeframe/recovery lifecycle must reapply the preferred chart style');
assert(sync.includes("if(sym===last&&(src==='workspace'||src==='chart-selector'))"),'same-symbol portfolio/chart rehydration must not publish a reset-worthy active-symbol event');
assert(sync.includes('function snapshotMatureView()')&&sync.includes('function restoreMatureView(snap)')&&sync.includes('setVisibleLogicalRange(snap.range)'),'same-symbol canonical setter calls must preserve and restore the mature chart viewport');
assert(sync.includes("if(host&&!document.body.contains(host))")&&sync.includes('detachedSnap=snap')&&sync.includes('queueChartRecovery(snap)'),'detached mature chart hosts must preserve viewport state and recover after a full workspace remount');
assert(sync.includes('function installTickCandleBridge()'),'1s chart must repair doji-only legacy tick candles before mature rendering');
assert(stage45.includes('if(window.__sbcMatureChartOwnerV1)return;'),'legacy Stage45 gestures must retire when mature owner is active');
assert(server.includes('/vendor/lightweight-charts-4.2.3.js'),'server must serve pinned local chart library');
assert(server.includes('/v45-active-symbol-sync-v1.js'),'server must serve active-symbol bridge');
assert(server.includes('/v45-mature-chart-owner-v1.js'),'server must serve mature chart owner');
assert(!server.includes('/v45-embedded-domain-chart-v1.js?v=1'),'failed PR169 embedded chart must no longer be injected');
console.log('Mature chart owner v1: PASS');
