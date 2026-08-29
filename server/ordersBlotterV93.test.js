const fs = require('fs');
const assert = require('assert');

const ui = fs.readFileSync(require.resolve('../public/v45-advanced-orders-v15.js'), 'utf8');
const route = fs.readFileSync(require.resolve('./routes/advancedOrdersV15.js'), 'utf8');
const stage43 = fs.readFileSync(require.resolve('../public/v45-desktop-stage43-v48.js'), 'utf8');
const stage43Css = fs.readFileSync(require.resolve('../public/v45-desktop-stage43-v48.css'), 'utf8');
const workstation = fs.readFileSync(require.resolve('../public/v45-chart-workstation-v1.js'), 'utf8');
const workstationCss = fs.readFileSync(require.resolve('../public/v45-chart-workstation-v1.css'), 'utf8');

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

const patchMatch=route.match(/router\.patch\('\/:id'[\s\S]*?router\.delete/);
assert(patchMatch,'Advanced replace route missing');
assert(patchMatch[0].includes('triggered_at=NULL'), 'Replacing Stop/Stop-Limit must clear stale trigger state before re-evaluation');
assert(patchMatch[0].includes('marketQueue.tick();'), 'Replacing Limit/Stop/Stop-Limit must immediately re-evaluate the new prices');
assert(patchMatch[0].includes("filled:current?.status === 'executed'"), 'Replacement response must expose an immediate fill');
assert(patchMatch[0].includes("queued:current?.status === 'pending'"), 'Non-marketable replacement must remain Working/pending');
assert(patchMatch[0].indexOf('triggered_at=NULL') < patchMatch[0].indexOf('marketQueue.tick();'), 'Stop-Limit trigger reset must happen before immediate re-evaluation');

const syncPriceMatch=stage43.match(/function syncPriceWindow\(ticket\)\{([\s\S]*?)\n\}/);
assert(syncPriceMatch, 'Stage 43 price-window sync missing');
assert(!syncPriceMatch[1].includes('.focus('), 'Passive price-window sync must never steal focus from ticker/order controls');
assert(stage43.includes('focus({preventScroll:true})'), 'Intentional order-type selection may focus its price field without scrolling the workspace');
assert(!stage43.includes("const timeNames=['TICK','1m','5m','15m','1h','1D']"), 'Stage 43 must not recreate the retired duplicate timeframe toolbar');
assert(!stage43.includes('data-stage43-time-v49') && !stage43.includes('data-stage43-chart-action'), 'Stage 43 must not proxy visible chart controls');
assert(workstation.includes("['TICK','1m','5m','15m','1h','1D']"), 'Chart Workstation must define the one compact timeframe set');
assert(workstation.includes('data-cw-time') && workstation.includes('clickTime(b.dataset.cwTime)'), 'Chart Workstation timeframe buttons must invoke native chart timeframe authority');
assert(workstation.includes("bar.dataset.chartPresentationOwner='workstation-v1'"), 'Chart Workstation must mark itself as the sole visible chart presentation owner');
assert(stage43.includes('[data-panel="recent"],[data-panel="fills"]'), 'Recent Activity and Fills rows must support order-detail drilldown');
assert(stage43.includes('ORDER INSTRUCTIONS') && stage43.includes('EXECUTION'), 'Order detail must separate instructions from execution');
assert(stage43.includes('o.limitPrice') && stage43.includes('o.stopPrice'), 'Advanced order detail must retain Limit/Stop/Stop-Limit instruction prices');
assert(stage43.includes('o.triggeredAt') && stage43.includes('o.executedPrice'), 'Advanced order detail must expose trigger and fill information');
assert(stage43Css.includes('.sbc-order-detail-v1') && !stage43Css.includes('.stage43-time-strip-v49'), 'Order detail modal must remain while retired Stage43 timeframe styling stays removed');
assert(workstationCss.includes('.cw-timeframes-v1'), 'The one visible chart toolbar must be styled by Chart Workstation');

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
