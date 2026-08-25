(()=>{
'use strict';
if(typeof window==='undefined'||typeof document==='undefined'||window.__sbcAdvancedChartVisualPassV1)return;
window.__sbcAdvancedChartVisualPassV1=true;

const ICONS={
  pointer:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l5.5 15 2-6.2L19 9.7z"/></svg>',
  trend:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.6 16.6L17.4 7.4"/></svg>',
  horizontal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="4.5" cy="12" r="2"/><path d="M8 12h13"/></svg>',
  clear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/></svg>',
  candles:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 4v4M6 14v6M18 4v6M18 16v4"/><rect x="4" y="8" width="4" height="6" rx=".5"/><rect x="16" y="10" width="4" height="6" rx=".5"/></svg>',
  line:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-7 4 4 7-9"/></svg>',
  indicators:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12h3l2-6 4 12 2-6h5"/></svg>'
};

const GOLD='#ffc928', BLUE='#2ab5ff', BG='#0d1117';
let api=null,overlay=null,fg=null,wrap=null,priceZone=null,visualCanvas=null,ctx=null;
let hoverIndex=-1,lineDrag=null,previewPoint=null,lastX=-1,lastY=-1;

function pointerToolActive(){return !!overlay?.querySelector('[data-tool="pointer"].active');}
function trendToolActive(){return !!overlay?.querySelector('[data-tool="trend"].active');}
function horizontalToolActive(){return !!overlay?.querySelector('[data-tool="horizontal"].active');}
function returnToPointer(){
  const pointer=overlay?.querySelector('[data-tool="pointer"]');
  if(pointer&&!pointer.classList.contains('active'))pointer.click();
}

function addStyles(){
  if(document.getElementById('sbcChartVisualPassV1Style'))return;
  const s=document.createElement('style');s.id='sbcChartVisualPassV1Style';s.textContent=`
    #advChartOverlay{background:radial-gradient(circle at 50% -25%,rgba(42,181,255,.055),transparent 44%),#0d1117!important}
    #advChartOverlay .adv-toolbar{min-height:46px;padding:7px 10px!important;gap:5px!important;background:rgba(17,21,29,.96)!important;backdrop-filter:blur(10px);box-shadow:0 1px 0 rgba(255,255,255,.025);flex-wrap:nowrap!important;overflow-x:auto}
    #advChartOverlay .adv-toolbar::-webkit-scrollbar{display:none}
    #advChartOverlay .adv-toolbar button{height:30px;min-width:30px;padding:0 9px!important;border-radius:6px!important;background:transparent!important;border-color:transparent!important;color:#aeb9c4!important;font-weight:650!important;transition:background .12s ease,color .12s ease,border-color .12s ease,transform .12s ease}
    #advChartOverlay .adv-toolbar button:hover{background:#19212b!important;color:#f7f9fb!important;border-color:#2a3542!important}
    #advChartOverlay .adv-toolbar button.active{background:rgba(255,201,40,.12)!important;color:${GOLD}!important;border-color:rgba(255,201,40,.34)!important}
    #advChartOverlay .adv-toolbar button.sbc-chart-icon-btn{width:32px;min-width:32px;padding:0!important;display:inline-flex;align-items:center;justify-content:center}
    #advChartOverlay .adv-toolbar button.sbc-chart-icon-btn svg{width:16px;height:16px;display:block}
    #advChartOverlay .adv-toolbar .sep{height:18px!important;background:#28323e!important;margin:0 3px!important}
    #advChartOverlay .adv-close{font-size:17px!important;color:#8d99a5!important}
    #advChartOverlay .adv-close:hover{color:#fff!important;background:#202832!important}
    #advChartOverlay .adv-chart-wrap{background:#0d1117}
    #advChartOverlay #advChartStatus{top:10px!important;bottom:auto!important;left:12px!important;padding:5px 8px;border:1px solid rgba(255,255,255,.06);border-radius:5px;background:rgba(13,17,23,.76);backdrop-filter:blur(5px);letter-spacing:.01em;color:#9ba7b3!important}
    #advChartOverlayCanvas{cursor:crosshair}
    #advChartOverlayCanvas.sbc-line-hover{cursor:move!important}
    #advChartOverlayCanvas.sbc-line-dragging{cursor:grabbing!important}
    #sbcChartVisualCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:4}
  `;document.head.appendChild(s);
}

function iconize(btn,key,label){
  if(!btn||btn.dataset.sbcIconized)return;
  btn.dataset.sbcIconized='1';btn.classList.add('sbc-chart-icon-btn');btn.title=label;btn.setAttribute('aria-label',label);btn.innerHTML=ICONS[key];
}
function iconizeToolbar(){
  if(!overlay)return;
  iconize(overlay.querySelector('[data-type="candles"]'),'candles','Candles');
  iconize(overlay.querySelector('[data-type="line"]'),'line','Line');
  iconize(overlay.querySelector('[data-tool="pointer"]'),'pointer','Pointer');
  iconize(overlay.querySelector('[data-tool="trend"]'),'trend','Trend Line');
  iconize(overlay.querySelector('[data-tool="horizontal"]'),'horizontal','Horizontal Line');
  iconize(overlay.querySelector('[data-action="clear"]'),'clear','Clear Drawings');
  iconize(overlay.querySelector('[data-action="indicators"]'),'indicators','Indicators');
}

function ensureVisualCanvas(){
  if(visualCanvas)return;
  visualCanvas=document.createElement('canvas');visualCanvas.id='sbcChartVisualCanvas';wrap.appendChild(visualCanvas);ctx=visualCanvas.getContext('2d');
  resizeVisual();
}
function resizeVisual(){
  if(!visualCanvas||!wrap)return;
  const r=wrap.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  visualCanvas.width=Math.max(1,Math.round(r.width*dpr));visualCanvas.height=Math.max(1,Math.round(r.height*dpr));
  visualCanvas.style.width=r.width+'px';visualCanvas.style.height=r.height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  drawVisual();
}

function selectedIndex(){return api?.interactions?.selectedIndex??-1;}
function drawCircle(x,y,r=5){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=BG;ctx.fill();ctx.strokeStyle=GOLD;ctx.lineWidth=2;ctx.stroke();}
function drawVisual(){
  if(!ctx||!api)return;
  const {w,h,pad}=api.view.state;ctx.clearRect(0,0,w,h);
  if(previewPoint&&lastX>=0&&trendToolActive()){
    ctx.save();ctx.strokeStyle=GOLD;ctx.globalAlpha=.95;ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(api.view.timeToX(previewPoint.time),api.view.priceToY(previewPoint.price));ctx.lineTo(lastX,lastY);ctx.stroke();ctx.restore();
  }
  const si=selectedIndex(),selected=api.drawings?.[si];
  if(selected?.points?.length){
    ctx.save();
    for(let i=0;i<selected.points.length;i++){
      const p=selected.points[i],x=selected.type==='horizontal'?w-pad.r-16:api.view.timeToX(p.time),y=api.view.priceToY(p.price);drawCircle(x,y,5);
    }
    ctx.restore();
  }
  if(hoverIndex>=0&&hoverIndex!==si){
    const d=api.drawings?.[hoverIndex];if(!d)return;
    ctx.save();ctx.strokeStyle=BLUE;ctx.globalAlpha=.8;ctx.lineWidth=2.2;
    if(d.type==='trend'&&d.points?.length>=2){const a=d.points[0],b=d.points[1];ctx.beginPath();ctx.moveTo(api.view.timeToX(a.time),api.view.priceToY(a.price));ctx.lineTo(api.view.timeToX(b.time),api.view.priceToY(b.price));ctx.stroke();}
    else if(d.type==='horizontal'&&d.points?.[0]){const y=api.view.priceToY(d.points[0].price);ctx.beginPath();ctx.moveTo(api.view.state.pad.l,y);ctx.lineTo(w-api.view.state.pad.r,y);ctx.stroke();}
    ctx.restore();
  }
}

function beginLineDrag(index,x,y){
  const d=api.drawings?.[index];if(!d?.points?.length)return null;
  return{index,originPoints:d.points.map(p=>({time:p.time,price:p.price})),originTime:api.view.xToTime(x),originPrice:api.view.yToPrice(y)};
}
function applyLineDrag(x,y){
  if(!lineDrag)return;
  const d=api.drawings?.[lineDrag.index];if(!d)return;
  const dt=api.view.xToTime(x)-lineDrag.originTime,dp=api.view.yToPrice(y)-lineDrag.originPrice;
  d.points.forEach((p,i)=>{const o=lineDrag.originPoints[i];if(d.type!=='horizontal')p.time=o.time+dt;p.price=o.price+dp;});
  api.notifyLayoutChanged?.();api.layers.renderScene();drawVisual();
}

function canvasPoint(e){const r=fg.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function refreshHover(x,y){
  if(!pointerToolActive()||lineDrag){hoverIndex=-1;fg.classList.remove('sbc-line-hover');drawVisual();return;}
  const next=api.hitTestDrawing(api.drawings,api.view,x,y,8);
  if(next!==hoverIndex){hoverIndex=next;fg.classList.toggle('sbc-line-hover',hoverIndex>=0);drawVisual();}
}

function onMouseDownCapture(e){
  if(e.button!==0)return;
  const {x,y}=canvasPoint(e);lastX=x;lastY=y;
  if(trendToolActive()){
    if(!previewPoint)previewPoint={time:api.view.xToTime(x),price:api.view.yToPrice(y)};
    else {previewPoint=null;setTimeout(returnToPointer,0);}
    requestAnimationFrame(drawVisual);return;
  }
  if(horizontalToolActive()){
    setTimeout(returnToPointer,0);
    return;
  }
  if(!pointerToolActive())return;
  const si=selectedIndex();if(api.hitTestHandle(api.drawings,si,api.view,x,y,12)>=0)return;
  const hit=api.hitTestDrawing(api.drawings,api.view,x,y,8);if(hit<0)return;
  e.preventDefault();e.stopImmediatePropagation();
  api.interactions.setSelectedIndex(hit);lineDrag=beginLineDrag(hit,x,y);hoverIndex=hit;fg.classList.remove('sbc-line-hover');fg.classList.add('sbc-line-dragging');api.layers.renderScene();drawVisual();
}
function onMouseMoveCapture(e){
  if(!overlay.classList.contains('open'))return;
  const {x,y}=canvasPoint(e);lastX=x;lastY=y;
  if(lineDrag){e.preventDefault();e.stopImmediatePropagation();applyLineDrag(x,y);return;}
  refreshHover(x,y);drawVisual();
}
function onMouseUpCapture(){
  if(!lineDrag)return;
  lineDrag=null;fg.classList.remove('sbc-line-dragging');api.notifyLayoutChanged?.();refreshHover(lastX,lastY);drawVisual();
}
function onPriceWheel(e){
  if(!api?.view||!overlay?.classList.contains('open'))return;
  e.preventDefault();e.stopImmediatePropagation();
  const {minPrice,maxPrice,minTime,maxTime}=api.view.state;
  const factor=e.deltaY>0?1.1:.9;
  const center=(minPrice+maxPrice)/2,span=Math.max(1e-9,(maxPrice-minPrice)*factor);
  api.view.setDomain(minTime,maxTime,center-span/2,center+span/2);
  api.layers.renderScene();drawVisual();
}
function onKeyDown(e){
  if(e.key!=='Escape'||!overlay?.classList.contains('open'))return;
  if(trendToolActive()||horizontalToolActive()){
    previewPoint=null;e.preventDefault();returnToPointer();requestAnimationFrame(drawVisual);
  }
}

function install(){
  api=window.__advChartV1Internals;overlay=document.getElementById('advChartOverlay');fg=document.getElementById('advChartOverlayCanvas');wrap=overlay?.querySelector('.adv-chart-wrap');priceZone=document.getElementById('advPriceScaleZone');
  if(!api?.view||!api?.drawings||!api?.interactions||!api?.hitTestDrawing||!api?.hitTestHandle||!overlay||!fg||!wrap||!priceZone)return false;
  addStyles();ensureVisualCanvas();iconizeToolbar();
  const toolbar=overlay.querySelector('.adv-toolbar');new MutationObserver(()=>iconizeToolbar()).observe(toolbar,{childList:true,subtree:true});
  fg.addEventListener('mousedown',onMouseDownCapture,true);window.addEventListener('mousemove',onMouseMoveCapture,true);window.addEventListener('mouseup',onMouseUpCapture,true);
  priceZone.addEventListener('wheel',onPriceWheel,{passive:false,capture:true});
  window.addEventListener('keydown',onKeyDown,true);
  toolbar.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.tool!=='trend')previewPoint=null;hoverIndex=-1;fg.classList.remove('sbc-line-hover');requestAnimationFrame(drawVisual);});
  window.addEventListener('resize',resizeVisual);
  overlay.addEventListener('transitionend',resizeVisual);
  const originalRenderScene=api.layers.renderScene.bind(api.layers);api.layers.renderScene=()=>{originalRenderScene();requestAnimationFrame(drawVisual);};
  const originalCross=api.layers.renderCrosshair.bind(api.layers);api.layers.renderCrosshair=()=>{originalCross();requestAnimationFrame(drawVisual);};
  requestAnimationFrame(()=>{resizeVisual();iconizeToolbar();drawVisual();});
  return true;
}

let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>120)clearInterval(timer);},50);
})();
