(()=>{
'use strict';

const THRESHOLD_PX=5;
const DOMINANCE_RATIO=1.5;

function decidePanAxis(dx,dy,threshold=THRESHOLD_PX,dominanceRatio=DOMINANCE_RATIO){
  const ax=Math.abs(Number(dx)||0),ay=Math.abs(Number(dy)||0);
  if(Math.hypot(ax,ay)<threshold)return null;
  if(ax>ay*dominanceRatio)return'time';
  if(ay>ax*dominanceRatio)return'price';
  return'both';
}

function panDomainFromDrag(domain,startX,startY,currentX,currentY,plotWidth,plotHeight){
  const timeSpan=Math.max(1,Number(domain.maxTime)-Number(domain.minTime));
  const priceSpan=Math.max(1e-9,Number(domain.maxPrice)-Number(domain.minPrice));
  const dx=Number(currentX)-Number(startX),dy=Number(currentY)-Number(startY);
  const timeShift=-(dx/Math.max(1,Number(plotWidth)||1))*timeSpan;
  const priceShift=(dy/Math.max(1,Number(plotHeight)||1))*priceSpan;
  return{
    minTime:Number(domain.minTime)+timeShift,
    maxTime:Number(domain.maxTime)+timeShift,
    minPrice:Number(domain.minPrice)+priceShift,
    maxPrice:Number(domain.maxPrice)+priceShift,
  };
}

function panDomainWithAxisLock(domain,startX,startY,currentX,currentY,plotWidth,plotHeight,axisLock,basePan=panDomainFromDrag){
  const next=basePan(domain,startX,startY,currentX,currentY,plotWidth,plotHeight);
  if(axisLock==='time'){
    next.minPrice=Number(domain.minPrice);
    next.maxPrice=Number(domain.maxPrice);
  }else if(axisLock==='price'){
    next.minTime=Number(domain.minTime);
    next.maxTime=Number(domain.maxTime);
  }
  return next;
}

function install(){
  if(typeof window==='undefined'||typeof document==='undefined'||window.__sbcAdvancedChartAxisLockV1)return false;
  const fg=document.getElementById('advChartOverlayCanvas');
  const api=window.__advChartV1Internals;
  if(!fg||!api?.view||!api?.layers||!api?.interactions||!api?.hitTestDrawing||!api?.hitTestHandle||!api?.panDomainFromDrag)return false;

  window.__sbcAdvancedChartAxisLockV1=true;
  let drag=null;

  const pointerToolActive=()=>{
    const active=document.querySelector('#advChartOverlay [data-tool="pointer"].active');
    return !!active;
  };

  fg.addEventListener('mousedown',e=>{
    if(e.button!==0||!pointerToolActive())return;
    const view=api.view,{w,pad}=view.state;
    const rect=fg.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    if(x>=w-pad.r)return;

    const selected=api.interactions.selectedIndex;
    if(api.hitTestHandle(api.drawings,selected,view,x,y)>=0)return;
    if(api.hitTestDrawing(api.drawings,view,x,y)>=0)return;

    e.preventDefault();
    e.stopImmediatePropagation();
    api.interactions.setSelectedIndex(-1);
    api.layers.renderScene();
    drag={startX:x,startY:y,domain:{...view.state},lock:null};
    fg.classList.add('grabbing');
  },true);

  window.addEventListener('mousemove',e=>{
    if(!drag)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const rect=fg.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    const dx=x-drag.startX,dy=y-drag.startY;
    if(!drag.lock)drag.lock=decidePanAxis(dx,dy);
    if(!drag.lock)return;
    const {pad,w,h}=api.view.state;
    const next=panDomainWithAxisLock(
      drag.domain,drag.startX,drag.startY,x,y,
      w-pad.l-pad.r,h-pad.t-pad.b,drag.lock,api.panDomainFromDrag
    );
    api.view.setDomain(next.minTime,next.maxTime,next.minPrice,next.maxPrice);
    api.layers.renderScene();
  },true);

  window.addEventListener('mouseup',()=>{
    if(!drag)return;
    drag=null;
    fg.classList.remove('grabbing');
  },true);

  return true;
}

if(typeof module!=='undefined'&&module.exports){
  module.exports={THRESHOLD_PX,DOMINANCE_RATIO,decidePanAxis,panDomainFromDrag,panDomainWithAxisLock};
}else{
  window.SBCAdvancedChartAxisLockV1={decidePanAxis,panDomainWithAxisLock,install};
  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer);},50);
}
})();
