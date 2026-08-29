const fs=require('fs');
const assert=require('assert');

const ui=fs.readFileSync('public/v45-advanced-orders-v15.js','utf8');
const receipt=fs.readFileSync('public/v45-trade-receipt-v1.js','utf8');

assert(ui.includes("window.SBCTradeReceiptV1"), 'advanced fills must use the shared transaction receipt');
assert(ui.includes("if(out?.filled){showFillReceipt"), 'immediate advanced fills must use receipt instead of acceptance alert');
assert(ui.includes("before&&String(before.status)==='pending'&&String(o.status)==='filled'"), 'delayed Stop/Stop-Limit fills must be detected as pending->filled transitions');
assert(ui.includes("window.addEventListener('sbc:portfolio-synced'"), 'Current Positions repaint must follow canonical backend portfolio sync');
assert(ui.includes("if(typeof renderHoldings==='function')renderHoldings()"), 'backend portfolio sync must repaint the native Current Positions table');
assert(!/function refreshPortfolioSurface\(\)[\s\S]*?renderPortfolio\(\)/.test(ui), 'targeted Current Positions repaint must not re-run full renderPortfolio/navigation');

const a=ui.indexOf('function tradeForOrder(');
const b=ui.indexOf('function showFillReceipt(',a);
assert(a>=0&&b>a,'tradeForOrder helper missing');
const factory=new Function('cache', ui.slice(a,b)+'; return tradeForOrder;');
const tradeForOrder=factory({trades:[]});
const order={symbol:'NVDA',side:'buy',executedAt:'2026-08-28T05:00:05Z'};
const trades=[
  {symbol:'NVDA',side:'buy',quantity:5,price:220,timestamp:'2026-08-28T05:00:04Z'},
  {symbol:'NVDA',side:'buy',quantity:7,price:221,timestamp:'2026-08-28T04:58:00Z'},
  {symbol:'AAPL',side:'buy',quantity:9,price:200,timestamp:'2026-08-28T05:00:05Z'}
];
const matched=tradeForOrder(order,trades);
assert.strictEqual(matched.quantity,5,'receipt must use the closest canonical NVDA buy fill');
assert.strictEqual(matched.price,220,'receipt must use canonical executed price');

// Behavioral regression: the legacy chart renderer remains available as truthful fallback,
// but once the mature chart host is ready, post-trade ticket refreshes may not redraw it.
const marker="if(window.__sbcPostTradeMatureChartGuardV1)return;window.__sbcPostTradeMatureChartGuardV1=true;";
const markerAt=receipt.indexOf(marker);
assert(markerAt>0,'post-trade mature chart redraw guard missing');
const guardStart=receipt.lastIndexOf('(()=>{',markerAt);
const guard=receipt.slice(guardStart);
let ready=false,legacyDraws=0;
const host={isConnected:true};
const document={querySelector:sel=>sel==='.sbc-mature-chart-host-v1.is-ready'&&ready?host:null};
const window={renderSymbolChart(){legacyDraws++;return 'legacy';}};
new Function('window','document','setTimeout',guard)(window,document,fn=>fn());
assert.strictEqual(window.renderSymbolChart(),'legacy','legacy chart must remain available before mature owner is ready');
assert.strictEqual(legacyDraws,1,'fallback legacy renderer should run exactly once before mature readiness');
ready=true;
assert.strictEqual(window.renderSymbolChart(),false,'legacy redraw must be suppressed once mature chart is ready');
assert.strictEqual(legacyDraws,1,'post-trade refresh must not redraw the legacy chart under the mature owner');

console.log('Advanced fill receipt + Current Positions sync + mature chart redraw guard: PASS');
