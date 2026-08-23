const assert = require('assert');
const {
  makeView,
  makeLayerRenderer,
  hitTestDrawing,
  hitTestHandle,
  dragDrawingHandle,
  deleteSelectedDrawing,
  makeDrawingInteractionController,
} = require('../public/v45-advanced-chart-v1.js');

const pad = { l:8, r:56, t:10, b:24 };
const view = makeView(1000, 600, pad);
view.setDomain(0, 1000, 0, 100);
const trend = { type:'trend', points:[{time:200,price:20},{time:800,price:80}] };

// 1) Hit-test correctness at two zoom levels, using real pixel transforms.
let mx=(view.timeToX(200)+view.timeToX(800))/2;
let my=(view.priceToY(20)+view.priceToY(80))/2;
assert.strictEqual(hitTestDrawing([trend],view,mx,my+4,6),0,'4px from trend must hit at wide zoom');
assert.strictEqual(hitTestDrawing([trend],view,mx,my+20,6),-1,'20px from trend must miss at wide zoom');
view.setDomain(150,850,10,90);
mx=(view.timeToX(200)+view.timeToX(800))/2;
my=(view.priceToY(20)+view.priceToY(80))/2;
assert.strictEqual(hitTestDrawing([trend],view,mx,my+4,6),0,'4px from trend must hit after zoom');
assert.strictEqual(hitTestDrawing([trend],view,mx,my+20,6),-1,'20px from trend must miss after zoom');

// 2) Drag correctness: stored coordinates must be inverse-transformed market coordinates.
const drawings=[JSON.parse(JSON.stringify(trend))];
const handleX=view.timeToX(drawings[0].points[1].time), handleY=view.priceToY(drawings[0].points[1].price);
assert.strictEqual(hitTestHandle(drawings,0,view,handleX,handleY,6),1,'second trend endpoint handle must be hittable');
const newX=640,newY=220;
assert.strictEqual(dragDrawingHandle(drawings,0,1,view,newX,newY),true);
assert(Math.abs(drawings[0].points[1].time-view.xToTime(newX))<1e-9,'dragged time must come from xToTime');
assert(Math.abs(drawings[0].points[1].price-view.yToPrice(newY))<1e-9,'dragged price must come from yToPrice');
assert.notStrictEqual(drawings[0].points[1].time,newX,'raw x pixel must not be stored as time');
assert.notStrictEqual(drawings[0].points[1].price,newY,'raw y pixel must not be stored as price');

// 3) Delete correctness: only selected middle drawing is removed.
const a={type:'horizontal',points:[{time:1,price:10}]};
const b={type:'horizontal',points:[{time:2,price:20}]};
const c={type:'horizontal',points:[{time:3,price:30}]};
const three=[JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),JSON.parse(JSON.stringify(c))];
const beforeA=JSON.stringify(three[0]), beforeC=JSON.stringify(three[2]);
const nextSelection=deleteSelectedDrawing(three,1);
assert.strictEqual(nextSelection,-1);
assert.strictEqual(three.length,2,'delete must remove exactly one drawing');
assert.strictEqual(JSON.stringify(three[0]),beforeA,'first drawing must be byte-for-byte unchanged');
assert.strictEqual(JSON.stringify(three[1]),beforeC,'third drawing must be byte-for-byte unchanged');

// 4) Deselect correctness: select then click truly empty space.
view.setDomain(0,1000,0,100);
const selectable=[{type:'horizontal',points:[{time:500,price:50}]}];
let bgDraws=0, fgDraws=0;
const layers=makeLayerRenderer({drawBackground(){bgDraws++;},drawForeground(){fgDraws++;}});
const controller=makeDrawingInteractionController({drawings:selectable,view,layers,threshold:6});
const hitY=view.priceToY(50);
controller.pointerDown(400,hitY);
assert.strictEqual(controller.selectedIndex,0,'horizontal line should select');
controller.pointerDown(400,hitY+40);
assert.strictEqual(controller.selectedIndex,-1,'empty click should deselect');

// 5) Layering discipline: crosshair foreground-only; active handle drag redraws background per frame.
bgDraws=0; fgDraws=0;
const editable=[{type:'trend',points:[{time:200,price:20},{time:800,price:80}]}];
const layers2=makeLayerRenderer({drawBackground(){bgDraws++;},drawForeground(){fgDraws++;}});
const controller2=makeDrawingInteractionController({drawings:editable,view,layers:layers2,threshold:6});
for(let i=0;i<10;i++) controller2.pointerMove(100+i,100);
assert.strictEqual(bgDraws,0,'plain crosshair movement must not redraw background');
assert.strictEqual(fgDraws,10,'plain crosshair movement must redraw foreground only');
controller2.setSelectedIndex(0);
const hx=view.timeToX(editable[0].points[0].time), hy=view.priceToY(editable[0].points[0].price);
assert.strictEqual(controller2.pointerDown(hx,hy).type,'handle','selected endpoint must begin handle drag');
controller2.pointerMove(hx+10,hy+5);
controller2.pointerMove(hx+20,hy+10);
controller2.pointerMove(hx+30,hy+15);
assert.strictEqual(bgDraws,3,'active handle drag must redraw background once per frame');
assert.strictEqual(fgDraws,13,'scene redraw must keep foreground aligned during handle drag');
controller2.pointerUp();

console.log('Stage98 Advanced Chart Stage4 selection/edit/delete behavior: PASS');
