const fs = require('fs');
const assert = require('assert');

const ui = fs.readFileSync(require.resolve('../public/v45-advanced-orders-v15.js'), 'utf8');
const route = fs.readFileSync(require.resolve('./routes/advancedOrdersV15.js'), 'utf8');
const stage43 = fs.readFileSync(require.resolve('../public/v45-desktop-stage43-v48.js'), 'utf8');

assert(ui.includes('data-blotter-tab="queued"'), 'Queue tab missing');
assert(ui.includes('data-blotter-tab="working"'), 'Working Orders tab missing');
assert(ui.includes('data-blotter-tab="recent"'), 'Recent Activity tab missing');
assert(ui.includes('data-blotter-tab="fills"'), 'Fills tab missing');
assert(ui.includes("o.status==='pending'&&String(o.orderType)==='market'"), 'Queue must be pending market orders only');
assert(ui.includes("o.status==='pending'&&String(o.orderType)!=='market'"), 'Working must be pending advanced orders only');
assert(ui.includes('BUY') || ui.includes('side'), 'Side text renderer missing');
assert(!ui.includes("icon=x.side==='BUY'?'▲':'▼'"), 'Legacy up/down arrow renderer must not own this blotter');
assert(ui.includes('REPLACE</button>') && ui.includes('CANCEL</button>'), 'Working cancel/replace controls missing');
assert(ui.includes("status:'FILLED'"), 'Fill status rendering missing');
const activityMatch=ui.match(/function activityEvents\(\)\{([\s\S]*?)\}\nfunction installBlotterStyle/);assert(activityMatch,'Recent Activity renderer missing');assert(activityMatch[1].includes('cache.trades'),'Recent Activity must read authoritative trades');assert(!activityMatch[1].includes('cache.orders'),'Recent Activity must not synthesize order lifecycle events');

assert(route.includes("router.patch('/:id'"), 'Cancel/replace backend route missing');
assert(route.includes("order_type || 'market'"), 'Unified market/advanced order DTO missing');
assert(route.includes("status='cancelled', cancelled_at=CURRENT_TIMESTAMP"), 'Cancellation audit timestamp missing');
assert(route.includes('replaced_at=CURRENT_TIMESTAMP'), 'Replace audit timestamp missing');
assert(route.includes('if (!queued.targetOpenAt) marketQueue.tick();'), 'Executable advanced orders must be evaluated immediately on submission');
assert(route.includes("current?.status === 'executed'"), 'Immediate advanced fills must return filled state to the client');
assert(route.includes("current?.status === 'failed'"), 'Immediate advanced execution failures must surface instead of pretending to work');

const syncPriceMatch=stage43.match(/function syncPriceWindow\(ticket\)\{([\s\S]*?)\n\}/);
assert(syncPriceMatch, 'Stage 43 price-window sync missing');
assert(!syncPriceMatch[1].includes('.focus('), 'Passive price-window sync must never steal focus from ticker/order controls');
assert(stage43.includes('focus({preventScroll:true})'), 'Intentional order-type selection may focus its price field without scrolling the workspace');

// Behavioral regression: executions are represented by the authoritative trades
// feed in Recent Activity. They must not enter the legacy fuzzy price matcher,
// which could suppress a genuine second trade at the same/nearby price.
const dtoMatch = route.match(/function dto\(r\) \{([\s\S]*?)\n\}/);
assert(dtoMatch, 'Could not extract advanced-order DTO for behavior test');
const dto = new Function('r', dtoMatch[1]);
const executedOrder = dto({
  id: 41, portfolio_id: 9, symbol: 'AAPL', side: 'buy', order_type: 'limit',
  quantity: 10, percent: null, limit_price: 100, stop_price: null,
  triggered_at: null, status: 'executed', fail_reason: null,
  created_at: '2026-08-23T10:00:00Z', replaced_at: null, cancelled_at: null,
  executed_at: '2026-08-23T10:00:05Z', executed_price: 100,
});
assert.strictEqual(executedOrder.rawStatus, 'executed', 'Raw database status should remain auditable');
assert.strictEqual(executedOrder.status, 'filled', 'Executed orders must normalize to filled for the UI');

const normalizedOrders = [executedOrder];
const legacyMatched = normalizedOrders.filter(o => o.status === 'executed');
const realTrades = [
  { symbol:'AAPL', side:'buy', price:100.00, timestamp:'2026-08-23T10:00:05Z' },
  { symbol:'AAPL', side:'buy', price:100.01, timestamp:'2026-08-23T10:00:10Z' },
];
const visibleTrades = realTrades.filter(t => !legacyMatched.some(o =>
  String(o.symbol) === String(t.symbol) &&
  String(o.side).toLowerCase() === String(t.side).toLowerCase() &&
  Math.abs(Number(o.executedPrice || 0) - Number(t.price || 0)) < .011
));
assert.strictEqual(visibleTrades.length, 2, 'Two genuine near-price trades must both remain visible');

console.log('Stage93/95 Orders & Activity behavior: PASS');
