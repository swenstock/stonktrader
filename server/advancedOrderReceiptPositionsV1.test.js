const fs=require('fs');
const assert=require('assert');

const ui=fs.readFileSync('public/v45-advanced-orders-v15.js','utf8');

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

console.log('Advanced fill receipt + Current Positions sync: PASS');
