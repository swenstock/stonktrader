const assert = require('assert');

global.window = { devicePixelRatio: 2 };
global.document = { readyState: 'loading', addEventListener() {} };
const chart = require('../public/v45-advanced-chart-v1.js');

const pad = { l: 8, r: 56, t: 10, b: 24 };
const view = chart.makeView(0, 0, pad);
view.setDomain(1000, 2000, 90, 110);

function fakeCanvas() { return { width:0, height:0, style:{} }; }
function fakeCtx() { return { transforms:[], setTransform(...args){ this.transforms.push(args); } }; }

const bg=fakeCanvas(), fg=fakeCanvas(), bgCtx=fakeCtx(), fgCtx=fakeCtx();
chart.resizeLayersForDpr({canvases:[bg,fg],contexts:[bgCtx,fgCtx],view,width:500,height:300,dpr:2});
assert.strictEqual(bg.width,1000);
assert.strictEqual(bg.height,600);
assert.strictEqual(fg.width,1000);
assert.strictEqual(fg.height,600);
assert.strictEqual(bg.style.width,'500px');
assert.strictEqual(fg.style.height,'300px');
assert.deepStrictEqual(bgCtx.transforms.at(-1),[2,0,0,2,0,0]);
assert.deepStrictEqual(fgCtx.transforms.at(-1),[2,0,0,2,0,0]);
assert.strictEqual(view.state.w,500);
assert.strictEqual(view.state.h,300);
const t=1375,p=103.25;
assert(Math.abs(view.xToTime(view.timeToX(t))-t)<1e-8,'time round trip must be DPR-independent');
assert(Math.abs(view.yToPrice(view.priceToY(p))-p)<1e-8,'price round trip must be DPR-independent');

let bgDraws=0,fgDraws=0;
const layers=chart.makeLayerRenderer({drawBackground(){bgDraws++;},drawForeground(){fgDraws++;}});
layers.renderScene();
assert.strictEqual(bgDraws,1); assert.strictEqual(fgDraws,1);
for(let i=0;i<25;i++) layers.renderCrosshair();
assert.strictEqual(bgDraws,1,'crosshair movement must not redraw background');
assert.strictEqual(fgDraws,26,'crosshair movement redraws foreground only');
layers.renderScene();
assert.strictEqual(bgDraws,2,'domain/data change redraws background');
assert.strictEqual(fgDraws,27,'scene redraw realigns foreground');
console.log('Stage2 Advanced Chart DPI + layered rendering behavior: PASS');
