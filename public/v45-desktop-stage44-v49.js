(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage44V49)return;window.__sbcDesktopStage44V49=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const state={x:1,y:1,pan:0,dragging:false,startX:0,startPan:0,surface:null};
function card(){return $('#view-portfolio .chart-trade-card')}
function chartSurface(root){
  if(!root)return null;
  const preferred=['.symbol-chart canvas','.symbol-chart svg','.chart-canvas canvas','.chart-canvas svg','canvas','svg'];
  for(const s of preferred){
    const list=$$(s,root).filter(x=>!x.closest('.stage43-chart-controls-v48')&&!x.closest('.desktop-chart-tools-popover-v45'));
    if(list.length)return list.sort((a,b)=>(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0];
  }
  return null;
}
function viewportFor(surface){
  if(!surface)return null;
  let p=surface.parentElement;
  while(p&&p!==document.body){const r=p.getBoundingClientRect();if(r.width>350&&r.height>120)return p;p=p.parentElement}
  return surface.parentElement;
}
function apply(){
  const s=state.surface;if(!s)return;
  state.pan=clamp(state.pan,-Math.max(0,(state.x-1)*220),Math.max(0,(state.x-1)*220));
  s.style.transformOrigin='50% 50%';
  s.style.transform=`translateX(${state.pan}px) scaleX(${state.x}) scaleY(${state.y})`;
  s.style.willChange='transform';
  const read=$('.stage44-scale-readout-v49',card());if(read)read.textContent=`${Math.round(state.x*100)}% TIME • ${Math.round(state.y*100)}% PRICE`;
  const view=viewportFor(s);if(view){view.classList.add('stage44-chart-viewport-v49');view.style.overflow='hidden';}
}
function fit(){state.x=1;state.y=1;state.pan=0;apply()}
function scalePrice(delta){state.y=clamp(Math.round((state.y+delta)*100)/100,.65,2.15);apply()}
function zoomTime(delta,anchor=.5){
  const prev=state.x,next=clamp(Math.round((state.x+delta)*100)/100,1,3.2);if(next===prev)return;
  state.x=next;
  if(prev>0&&anchor!==.5){const direction=(anchor-.5)*2;state.pan-=direction*(next-prev)*90;}
  if(state.x===1)state.pan=0;apply();
}
function installControls(root){
  const dock=$('.stage43-chart-controls-v48',root);if(!dock)return;
  let group=$('.stage44-chart-scale-v49',dock);if(!group){
    group=document.createElement('div');group.className='stage44-chart-scale-v49';
    group.innerHTML='<span class="stage44-scale-readout-v49">100% TIME • 100% PRICE</span><button type="button" data-stage44-price-down title="Compress price scale">PRICE −</button><button type="button" data-stage44-price-up title="Expand price scale">PRICE +</button><button type="button" data-stage44-fit title="Fit chart to window">FIT</button>';
    dock.prepend(group);
    $('[data-stage44-price-down]',group).onclick=()=>scalePrice(-.12);
    $('[data-stage44-price-up]',group).onclick=()=>scalePrice(.12);
    $('[data-stage44-fit]',group).onclick=fit;
  }
  const tools=$('.stage43-tools-menu-v48',root);if(tools&&!$('[data-stage44-fit-menu]',tools)){
    const view=$$('section',tools).find(x=>/VIEW/i.test(x.textContent||''))||tools.lastElementChild;
    const b=document.createElement('button');b.type='button';b.dataset.stage44FitMenu='1';b.textContent='FIT';b.onclick=fit;view?.appendChild(b);
  }
}
function bindSurface(root){
  const s=chartSurface(root);if(!s||s===state.surface)return;
  if(state.surface){state.surface.style.transform='';state.surface.style.willChange='';}
  state.surface=s;fit();
  const view=viewportFor(s);if(!view)return;
  if(view.dataset.stage44Bound)return;view.dataset.stage44Bound='1';view.classList.add('stage44-chart-viewport-v49');
  view.addEventListener('wheel',e=>{
    if(e.ctrlKey)return;
    const rect=view.getBoundingClientRect(),anchor=clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1);
    e.preventDefault();
    zoomTime(e.deltaY<0?.13:-.13,anchor);
  },{passive:false});
  view.addEventListener('pointerdown',e=>{
    if(state.x<=1)return;state.dragging=true;state.startX=e.clientX;state.startPan=state.pan;view.setPointerCapture?.(e.pointerId);view.classList.add('is-panning-v49');
  });
  view.addEventListener('pointermove',e=>{if(!state.dragging)return;state.pan=state.startPan+(e.clientX-state.startX);apply();});
  const stop=()=>{state.dragging=false;view.classList.remove('is-panning-v49')};
  view.addEventListener('pointerup',stop);view.addEventListener('pointercancel',stop);view.addEventListener('lostpointercapture',stop);
  view.addEventListener('dblclick',e=>{e.preventDefault();fit()});
}
function help(root){let h=$('.stage44-chart-help-v49',root);if(h)return;const dock=$('.stage43-chart-controls-v48',root);if(!dock)return;h=document.createElement('div');h.className='stage44-chart-help-v49';h.textContent='Wheel to zoom time • Drag to pan • PRICE ± to scale candles • Double-click or FIT to reset';dock.after(h);}
function enhance(){const root=card();if(!root)return;root.classList.add('stage44-resizable-chart-v49');installControls(root);bindSurface(root);help(root);apply();}
function start(){enhance();let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(enhance,90)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,1600)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();