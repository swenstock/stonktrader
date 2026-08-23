const assert = require('assert');

global.window = { devicePixelRatio: 1 };
global.document = { readyState: 'loading', addEventListener() {} };
const {
  makeView,
  hitTestDrawing,
  createLayoutPayload,
  buildAccountOverlays,
  drawAccountOverlays,
  makeAccountOverlayController,
} = require('../public/v45-advanced-chart-v1.js');

function fakeCtx() {
  const lines = [];
  let current = null;
  return {
    lines,
    save(){}, restore(){}, setLineDash(){}, beginPath(){ current = {}; },
    moveTo(x,y){ current = {x1:x,y1:y}; },
    lineTo(x,y){ current = {...(current||{}),x2:x,y2:y}; },
    stroke(){ if(current) lines.push(current); },
    fillRect(){}, fillText(){}, measureText(t){ return {width:String(t).length*6}; },
    set font(v){ this._font=v; }, get font(){ return this._font; },
    set strokeStyle(v){ this._strokeStyle=v; }, get strokeStyle(){ return this._strokeStyle; },
    set fillStyle(v){ this._fillStyle=v; }, get fillStyle(){ return this._fillStyle; },
    set lineWidth(v){ this._lineWidth=v; }, get lineWidth(){ return this._lineWidth; },
    set globalAlpha(v){ this._globalAlpha=v; }, get globalAlpha(){ return this._globalAlpha; },
  };
}

(async () => {
  const view = makeView(1000, 500, {l:8,r:56,t:10,b:24});
  view.setDomain(0, 1000, 80, 120);

  // 1. Average cost overlay is built and rendered at the exact position price.
  const positionPortfolio = { positions:[{symbol:'AAPL',quantity:12,avgCost:101.25}] };
  const avgOnly = buildAccountOverlays('AAPL', [], positionPortfolio);
  assert.strictEqual(avgOnly.length, 1, 'one position must produce one average-cost overlay');
  assert.strictEqual(avgOnly[0].kind, 'position');
  assert.strictEqual(avgOnly[0].price, 101.25, 'average-cost overlay must use the live avgCost field');
  const ctx = fakeCtx();
  const drawn = drawAccountOverlays(ctx, view, avgOnly);
  assert.strictEqual(drawn.length, 1, 'average-cost line should render once');
  assert(Math.abs(drawn[0].y - view.priceToY(101.25)) < 1e-9, 'average-cost line must render at priceToY(avgCost)');
  assert.strictEqual(buildAccountOverlays('MSFT', [], positionPortfolio).length, 0, 'position in another symbol must not render');

  // 2. Working order overlays: pending + non-market + current symbol only, at the correct trigger.
  const orders = [
    {id:1,symbol:'AAPL',status:'pending',orderType:'limit',side:'buy',limitPrice:95},
    {id:2,symbol:'AAPL',status:'pending',orderType:'stop',side:'sell',stopPrice:88},
    {id:3,symbol:'AAPL',status:'pending',orderType:'stop_limit',side:'sell',stopPrice:87,limitPrice:86.5},
    {id:4,symbol:'AAPL',status:'pending',orderType:'market',side:'buy'},
    {id:5,symbol:'AAPL',status:'executed',orderType:'limit',side:'buy',limitPrice:96},
    {id:6,symbol:'MSFT',status:'pending',orderType:'limit',side:'buy',limitPrice:250},
  ];
  const built = buildAccountOverlays('AAPL', orders, null);
  assert.deepStrictEqual(built.map(x=>x.price), [95,88,87], 'only AAPL working non-market trigger prices should render');
  assert.deepStrictEqual(built.map(x=>x.side), ['buy','sell','sell']);
  assert.strictEqual(built.some(x=>x.orderId===4||x.orderId===5||x.orderId===6), false, 'market, non-pending, and other-symbol orders are excluded');

  // 3. Overlay rendering does not alter drawings and Stage 5 persistence cannot contain account overlays.
  const drawings = [{type:'horizontal',points:[{time:400,price:99}]}];
  const before = JSON.stringify(drawings);
  drawAccountOverlays(fakeCtx(), view, built);
  assert.strictEqual(JSON.stringify(drawings), before, 'rendering account overlays must not mutate drawings');
  const payload = createLayoutPayload({drawings,activeIndicators:['sma'],chartType:'candles',interval:'5m',accountOverlays:built,orders,positions:positionPortfolio.positions});
  assert.strictEqual(Object.prototype.hasOwnProperty.call(payload,'accountOverlays'), false, 'account overlays must never enter Stage 5 payload');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(payload,'orders'), false, 'orders must never enter Stage 5 payload');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(payload,'positions'), false, 'positions must never enter Stage 5 payload');

  // 4. Overlay lines are not hit-testable because hit testing only receives the drawings array.
  const emptyDrawings = [];
  const overlayY = view.priceToY(95);
  assert.strictEqual(hitTestDrawing(emptyDrawings, view, 500, overlayY, 6), -1, 'overlay line must not be selectable as a drawing');

  // 5. Symbol switch clears stale overlays immediately and stale async AAPL work cannot overwrite MSFT.
  let refreshCall = 0;
  let releaseFirst;
  const firstRefresh = new Promise(resolve => { releaseFirst = resolve; });
  const renderSnapshots = [];
  const controller = makeAccountOverlayController({
    getOrders: () => orders,
    getPortfolio: () => ({positions:[{symbol:'MSFT',quantity:4,avgCost:240}]}),
    refreshOrders: () => (++refreshCall === 1 ? firstRefresh : Promise.resolve()),
    render: overlays => renderSnapshots.push(overlays.map(x=>`${x.symbol}:${x.price}`)),
  });
  const aaplPending = controller.setSymbol('AAPL');
  assert.deepStrictEqual(controller.overlays, [], 'symbol switch must clear previous overlays synchronously before refresh');
  await controller.setSymbol('MSFT');
  assert(controller.overlays.every(x=>x.symbol==='MSFT'), 'new symbol may only show its own overlays');
  assert.deepStrictEqual(controller.overlays.map(x=>x.price), [240,250], 'MSFT position and working order should replace AAPL overlays');
  releaseFirst();
  await aaplPending;
  assert(controller.overlays.every(x=>x.symbol==='MSFT'), 'late AAPL response must not restore stale overlays');
  assert(renderSnapshots.some(x=>x.length===0), 'clear must actually render an empty overlay frame before replacement');

  // 6. Endpoint/storage-side account-data failure degrades to no overlays and never throws.
  const failing = makeAccountOverlayController({
    getOrders: () => { throw new Error('should not be reached after refresh failure'); },
    getPortfolio: () => positionPortfolio,
    refreshOrders: async () => { throw new Error('orders unavailable'); },
    render: () => {},
  });
  let failResult;
  await assert.doesNotReject(async () => { failResult = await failing.setSymbol('AAPL'); }, 'orders endpoint failure must not break chart');
  assert.deepStrictEqual(failResult, [], 'failed account-data refresh should result in no overlays');

  console.log('Stage102 Advanced Chart Stage6 order/position overlays behavior: PASS');
})().catch(err => { console.error(err); process.exit(1); });
