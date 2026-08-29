(()=>{
'use strict';

const isBrowser=typeof window!=='undefined'&&typeof document!=='undefined';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const median=values=>{const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!xs.length)return 1;const m=Math.floor(xs.length/2);return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;};
function panTimeDomain(domain,dx,plotWidth){
  const span=Math.max(1,Number(domain.maxTime)-Number(domain.minTime));
  const shift=-(Number(dx)/Math.max(1,Number(plotWidth)||1))*span;
  return{minTime:Number(domain.minTime)+shift,maxTime:Number(domain.maxTime)+shift};
}
function zoomTimeDomain(domain,anchorTime,deltaY){
  const min=Number(domain.minTime),max=Number(domain.maxTime),anchor=Number(anchorTime);
  const factor=Math.exp(clamp(Number(deltaY)||0,-240,240)*0.0018);
  return{minTime:anchor-(anchor-min)*factor,maxTime:anchor+(max-anchor)*factor};
}
function zoomPriceDomain(domain,anchorPrice,deltaY){
  const min=Number(domain.minPrice),max=Number(domain.maxPrice),anchor=Number(anchorPrice);
  const factor=Math.exp(clamp(Number(deltaY)||0,-240,240)*0.0018);
  return{minPrice:anchor-(anchor-min)*factor,maxPrice:anchor+(max-anchor)*factor};
}
function scalePriceDomainFromDrag(domain,startY,currentY,plotHeight){
  const min=Number(domain.minPrice),max=Number(domain.maxPrice),center=(min+max)/2;
  const factor=Math.exp((Number(currentY)-Number(startY))/Math.max(80,Number(plotHeight)||1));
  const span=Math.max(1e-9,(max-min)*factor);
  return{minPrice:center-span/2,maxPrice:center+span/2};
}
const exported={panTimeDomain,zoomTimeDomain,zoomPriceDomain,scalePriceDomainFromDrag};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
if(!isBrowser||!window.matchMedia('(min-width:901px)').matches||window.__sbcEmbeddedDomainChartV1)return;
window.__sbcEmbeddedDomainChartV1=true;

const $=(s,r=document)=>r?.querySelector?.(s)||null,$$=(s,r=document)=>r?[...r.querySelectorAll(s)]:[];
const norm=s=>String(s||'').trim().toUpperCase();
const TF_MAP={TICK:'tick','1S':'tick','1M':'1m','5M':'5m','15M':'15m','1H':'1h','1D':'1D'};
const DEFAULT_VISIBLE={tick:46,'1m':44,'5m':42,'15m':40,'1h':36,'1D':32};
const state={symbol:'',timeframe:'5m',chartType:'candles',showVolume:true,showMA:false,showEMA:false,bars:[],domain:null,priceManual:false,followLatest:true,loading:false,requestSeq:0,canvas:null,ctx:null,viewport:null,card:null,drag:null,priceDrag:null,resizeObserver:null,lastSize:'',refreshTimer:0};

function installStyle(){
  if($('#sbcEmbeddedDomainChartV1Style'))return;
  const s=document.createElement('style');s.id='sbcEmbeddedDomainChartV1Style';s.textContent=`
  #view-portfolio .sbc-domain-chart-host-v1{position:relative!important;overflow:hidden!important;touch-action:none!important}
  #view-portfolio .sbc-domain-chart-v1{position:absolute;inset:0;width:100%;height:100%;z-index:3;display:block;cursor:grab;touch-action:none;user-select:none}
  #view-portfolio .sbc-domain-chart-v1.is-grabbing{cursor:grabbing}
  #view-portfolio .sbc-domain-chart-host-v1>.sbc-native-chart-retired-v1{opacity:0!important;pointer-events:none!important}
  #view-portfolio .sbc-domain-chart-host-v1 .chart-drawing-overlay-v1{z-index:5!important}
  #view-portfolio .sbc-domain-chart-host-v1 .chart-drawing-rail-v1{z-index:6!important}
  `;document.head.appendChild(s);
}
function card(){return $('#view-portfolio .chart-trade-card')}
function nativeSurface(c=card()){
  return $$('.symbol-chart canvas,.symbol-chart svg,.chart-canvas canvas,.chart-canvas svg,canvas,svg',c).filter(x=>!x.classList.contains('sbc-domain-chart-v1')&&!x.closest('.chart-drawing-overlay-v1')&&!x.closest('.stage43-chart-controls-v48')).sort((a,b)=>(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0]||null;
}
function findViewport(c=card()){
  const s=nativeSurface(c);if(!s)return null;let p=s.parentElement;while(p&&p!==c&&p!==document.body){const r=p.getBoundingClientRect();if(r.width>420&&r.height>150)return p;p=p.parentElement;}return s.parentElement||null;
}
function inferSymbol(c=card()){
  const globals=[window.chartSymbol,window.selectedSymbol,window.activeSymbol].map(norm).find(x=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x));if(globals)return globals;
  const sels=['#view-portfolio .trade-search-row select','#view-portfolio .quick-trade-clean select','#view-portfolio select'];
  for(const sel of sels){const v=norm($(sel)?.value);if(/^[A-Z][A-Z0-9.\-]{0,9}$/.test(v))return v;}
  const head=String($('.symbol-chart-head',c)?.textContent||'');const m=head.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/);return m?m[0]:(state.symbol||'AAPL');
}
function inferTimeframe(c=card()){
  const tb=$('.chart-toolbar',c);const active=tb&&$$('button',tb).find(b=>b.classList.contains('active')||b.getAttribute('aria-pressed')==='true'||b.dataset.active==='true');
  const key=norm(active?.textContent);return TF_MAP[key]||state.timeframe||'5m';
}
function nativeActive(label,c=card()){
  const want=norm(label);const b=$$('button',c).find(x=>!x.closest('.chart-workstation-v1')&&norm(x.textContent)===want);return !!b&&(b.classList.contains('active')||b.getAttribute('aria-pressed')==='true'||b.dataset.active==='true');
}
function syncNativePrefs(){
  state.chartType=nativeActive('LINE')?'line':'candles';state.showVolume=nativeActive('VOL')||nativeActive('VOLUME');state.showMA=nativeActive('MA');state.showEMA=nativeActive('EMA');
}
function mapApiBars(bars){return(Array.isArray(bars)?bars:[]).map(b=>({t:new Date(b.time??b.t??Date.now()).getTime(),open:Number(b.open??b.o),high:Number(b.high??b.h),low:Number(b.low??b.l),close:Number(b.close??b.c),volume:Number(b.volume??b.v??0)})).filter(b=>[b.t,b.open,b.high,b.low,b.close].every(Number.isFinite)).sort((a,b)=>a.t-b.t);}
function syntheticTickBars(symbol){
  try{if(typeof window.generateOHLC==='function'){const raw=window.generateOHLC(symbol,'tick');const now=Date.now();return(Array.isArray(raw)?raw:[]).map((b,i,a)=>({t:now-(a.length-1-i)*1000,open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c),volume:Number(b.v||0)})).filter(b=>[b.open,b.high,b.low,b.close].every(Number.isFinite));}}catch(_){ }return[];
}
function spacing(bars=state.bars){const gaps=[];for(let i=1;i<bars.length;i++){const g=bars[i].t-bars[i-1].t;if(g>0)gaps.push(g);}return Math.max(1,median(gaps));}
function visibleBars(domain=state.domain){if(!domain)return state.bars;return state.bars.filter(b=>b.t>=domain.minTime&&b.t<=domain.maxTime);}
function autoPrice(){
  const vis=visibleBars();if(!vis.length||!state.domain)return;const lo=Math.min(...vis.map(b=>b.low)),hi=Math.max(...vis.map(b=>b.high)),span=Math.max(.01,hi-lo),pad=span*.10;state.domain.minPrice=lo-pad;state.domain.maxPrice=hi+pad;
}
function resetDomain(){
  if(!state.bars.length)return;const n=Math.min(state.bars.length,DEFAULT_VISIBLE[state.timeframe]||42),step=spacing(),last=state.bars[state.bars.length-1].t;const first=state.bars[Math.max(0,state.bars.length-n)].t;
  state.domain={minTime:first-step*.5,maxTime:last+step*2,minPrice:0,maxPrice:1};state.priceManual=false;state.followLatest=true;autoPrice();
}
function xToTime(x,w){const d=state.domain,plotW=Math.max(1,w-64-12);return d.minTime+((x-12)/plotW)*(d.maxTime-d.minTime);}
function yToPrice(y,h){const d=state.domain,plotH=Math.max(1,h-18-58);return d.maxPrice-((y-18)/plotH)*(d.maxPrice-d.minPrice);}
function timeToX(t,w){const d=state.domain;return 12+((t-d.minTime)/(d.maxTime-d.minTime||1))*Math.max(1,w-76);}
function priceToY(p,h){const d=state.domain;return 18+(1-(p-d.minPrice)/(d.maxPrice-d.minPrice||1))*Math.max(1,h-76);}
function sizeCanvas(){
  const c=state.canvas,v=state.viewport;if(!c||!v)return false;const r=v.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height));if(w<120||h<100)return false;const dpr=Math.max(1,window.devicePixelRatio||1),key=w+'x'+h+'@'+dpr;if(key===state.lastSize)return true;state.lastSize=key;c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.width=w+'px';c.style.height=h+'px';state.ctx.setTransform(dpr,0,0,dpr,0,0);return true;
}
function drawMA(ctx,bars,w,h,period,alpha){if(bars.length<period)return;ctx.beginPath();let started=false;for(let i=period-1;i<bars.length;i++){let sum=0;for(let j=i-period+1;j<=i;j++)sum+=bars[j].close;const x=timeToX(bars[i].t,w),y=priceToY(sum/period,h);if(x<0||x>w)continue;if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);}ctx.globalAlpha=alpha;ctx.strokeStyle='#f3c748';ctx.lineWidth=1.4;ctx.stroke();ctx.globalAlpha=1;}
function drawEMA(ctx,bars,w,h,period){if(!bars.length)return;const k=2/(period+1);let ema=bars[0].close;ctx.beginPath();let started=false;for(const b of bars){ema=b.close*k+ema*(1-k);const x=timeToX(b.t,w),y=priceToY(ema,h);if(x<0||x>w)continue;if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);}ctx.strokeStyle='#5ec7ff';ctx.lineWidth=1.35;ctx.stroke();}
function render(){
  if(!sizeCanvas()||!state.domain||!state.bars.length)return;const c=state.canvas,ctx=state.ctx,w=parseFloat(c.style.width)||c.clientWidth,h=parseFloat(c.style.height)||c.clientHeight,padL=12,padR=64,padT=18,padB=58,plotR=w-padR,plotB=h-padB;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1017';ctx.fillRect(0,0,w,h);ctx.font='10px Inter,system-ui,sans-serif';ctx.lineWidth=1;
  for(let i=0;i<=5;i++){const x=padL+(plotR-padL)*(i/5);ctx.strokeStyle='rgba(116,136,156,.18)';ctx.beginPath();ctx.moveTo(x,padT);ctx.lineTo(x,plotB);ctx.stroke();const t=state.domain.minTime+(state.domain.maxTime-state.domain.minTime)*(i/5);ctx.fillStyle='#81909d';ctx.textAlign='center';ctx.fillText(state.timeframe==='1D'?new Date(t).toLocaleDateString([],{month:'short',day:'numeric'}):new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),x,h-9);}
  for(let i=0;i<=5;i++){const p=state.domain.minPrice+(state.domain.maxPrice-state.domain.minPrice)*(i/5),y=priceToY(p,h);ctx.strokeStyle='rgba(116,136,156,.18)';ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(plotR,y);ctx.stroke();ctx.fillStyle='#9eabb6';ctx.textAlign='left';ctx.fillText(p.toFixed(2),plotR+7,y+3);}
  ctx.save();ctx.beginPath();ctx.rect(padL,padT,plotR-padL,plotB-padT);ctx.clip();const vis=visibleBars();const stepPx=Math.abs(timeToX((vis[0]?.t||state.domain.minTime)+spacing(),w)-timeToX(vis[0]?.t||state.domain.minTime,w)),barW=clamp(stepPx*.68,2,11),maxVol=Math.max(1,...vis.map(b=>b.volume));
  if(state.showVolume){const volH=42;for(const b of vis){const x=timeToX(b.t,w),vh=(b.volume/maxVol)*volH;ctx.fillStyle=b.close>=b.open?'rgba(46,230,166,.28)':'rgba(255,93,93,.28)';ctx.fillRect(x-barW/2,plotB-vh,barW,vh);}}
  if(state.chartType==='line'){ctx.beginPath();let started=false;for(const b of vis){const x=timeToX(b.t,w),y=priceToY(b.close,h);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y);}ctx.strokeStyle='#ffc928';ctx.lineWidth=1.6;ctx.stroke();}
  else for(const b of vis){const x=timeToX(b.t,w),yo=priceToY(b.open,h),yc=priceToY(b.close,h),yh=priceToY(b.high,h),yl=priceToY(b.low,h),up=b.close>=b.open;ctx.strokeStyle=ctx.fillStyle=up?'#2ee6a6':'#ff5d5d';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x,yh);ctx.lineTo(x,yl);ctx.stroke();ctx.fillRect(x-barW/2,Math.min(yo,yc),barW,Math.max(1,Math.abs(yc-yo)));}
  if(state.showMA)drawMA(ctx,vis,w,h,20,.92);if(state.showEMA)drawEMA(ctx,vis,w,h,20);ctx.restore();ctx.textAlign='left';
}
async function loadBars({reset=false}={}){
  if(state.loading&&!reset)return;const seq=++state.requestSeq,symbol=inferSymbol(),tf=state.timeframe;state.loading=true;let bars=[];
  try{if(tf==='tick')bars=syntheticTickBars(symbol);else{const r=await fetch(`/api/quotes/bars?symbol=${encodeURIComponent(symbol)}&interval=${tf}`,{cache:'no-store'});if(!r.ok)throw new Error('bars '+r.status);const d=await r.json();bars=mapApiBars(d.bars);}}
  catch(e){console.warn('[embedded-domain-chart]',e?.message||e);}finally{if(seq!==state.requestSeq)return;state.loading=false;}
  if(!bars.length)return;const oldLast=state.bars[state.bars.length-1]?.t||null,newLast=bars[bars.length-1].t;state.symbol=symbol;state.bars=bars;if(reset||!state.domain)resetDomain();else if(state.followLatest&&oldLast&&newLast!==oldLast){const shift=newLast-oldLast;state.domain.minTime+=shift;state.domain.maxTime+=shift;if(!state.priceManual)autoPrice();}render();
}
function setTimeframe(tf){tf=TF_MAP[norm(tf)]||tf;if(!DEFAULT_VISIBLE[tf]||tf===state.timeframe&&state.bars.length)return;state.timeframe=tf;state.domain=null;state.followLatest=true;loadBars({reset:true});}
function fit(){resetDomain();render();}
function bindCanvas(c){
  if(c.dataset.sbcDomainBound)return;c.dataset.sbcDomainBound='1';
  c.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,axis=x>=r.width-64;if(axis){state.priceDrag={startY:e.clientY,domain:{minPrice:state.domain.minPrice,maxPrice:state.domain.maxPrice}};state.priceManual=true;}else{state.drag={startX:e.clientX,domain:{minTime:state.domain.minTime,maxTime:state.domain.maxTime}};state.followLatest=false;c.classList.add('is-grabbing');}c.setPointerCapture?.(e.pointerId);});
  c.addEventListener('pointermove',e=>{if(!state.domain)return;const r=c.getBoundingClientRect();if(state.priceDrag){const next=scalePriceDomainFromDrag(state.priceDrag.domain,state.priceDrag.startY,e.clientY,r.height-76);state.domain.minPrice=next.minPrice;state.domain.maxPrice=next.maxPrice;render();return;}if(state.drag){const next=panTimeDomain(state.drag.domain,e.clientX-state.drag.startX,r.width-76);state.domain.minTime=next.minTime;state.domain.maxTime=next.maxTime;if(!state.priceManual)autoPrice();render();}});
  const stop=()=>{state.drag=null;state.priceDrag=null;c.classList.remove('is-grabbing');};c.addEventListener('pointerup',stop);c.addEventListener('pointercancel',stop);c.addEventListener('lostpointercapture',stop);
  c.addEventListener('wheel',e=>{if(!state.domain)return;e.preventDefault();e.stopPropagation();const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x>=r.width-64){const anchor=yToPrice(y,r.height),next=zoomPriceDomain(state.domain,anchor,e.deltaY);state.domain.minPrice=next.minPrice;state.domain.maxPrice=next.maxPrice;state.priceManual=true;render();return;}const anchor=xToTime(x,r.width),next=zoomTimeDomain(state.domain,anchor,e.deltaY),minSpan=spacing()*8,maxSpan=Math.max(minSpan,Math.max(spacing()*12,(state.bars[state.bars.length-1].t-state.bars[0].t)*1.35)),span=next.maxTime-next.minTime;if(span<minSpan||span>maxSpan)return;state.domain.minTime=next.minTime;state.domain.maxTime=next.maxTime;state.followLatest=false;if(!state.priceManual)autoPrice();render();},{passive:false});
  c.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();const r=c.getBoundingClientRect();if(e.clientX-r.left>=r.width-64){state.priceManual=false;autoPrice();render();}else fit();});
}
function retireNative(v){for(const el of $$('canvas,svg',v)){if(el===state.canvas||el.closest('.chart-drawing-overlay-v1'))continue;el.classList.add('sbc-native-chart-retired-v1');}}
function mount(){
  installStyle();const c=card(),v=findViewport(c);if(!c||!v)return false;state.card=c;state.viewport=v;v.classList.add('stage45-chart-viewport-v50','sbc-domain-chart-host-v1');let canvas=$('.sbc-domain-chart-v1',v);if(!canvas){canvas=document.createElement('canvas');canvas.className='sbc-domain-chart-v1';canvas.setAttribute('aria-label','Interactive price chart');v.appendChild(canvas);}state.canvas=canvas;state.ctx=canvas.getContext('2d');bindCanvas(canvas);retireNative(v);syncNativePrefs();const sym=inferSymbol(c),tf=inferTimeframe(c);if(tf!==state.timeframe){state.timeframe=tf;state.domain=null;}if(sym!==state.symbol||!state.bars.length)loadBars({reset:true});else render();if(!state.resizeObserver&&typeof ResizeObserver!=='undefined'){state.resizeObserver=new ResizeObserver(()=>{state.lastSize='';render();});state.resizeObserver.observe(v);}window.SBCChartViewportV50={fit,price(d){if(!state.domain)return;const center=(state.domain.minPrice+state.domain.maxPrice)/2,next=zoomPriceDomain(state.domain,center,-Number(d||0)*500);state.domain.minPrice=next.minPrice;state.domain.maxPrice=next.maxPrice;state.priceManual=true;render();},time(d){if(!state.domain)return;const center=(state.domain.minTime+state.domain.maxTime)/2,next=zoomTimeDomain(state.domain,center,-Number(d||0)*500);state.domain.minTime=next.minTime;state.domain.maxTime=next.maxTime;state.followLatest=false;if(!state.priceManual)autoPrice();render();},resetPrice(){state.priceManual=false;autoPrice();render();},resetTime(){resetDomain();render();},repaint:render,repaintPrice:render,apply:render,state};window.SBCEmbeddedChartV1={setTimeframe,fit,render,loadBars,state};return true;
}
function onWorkstationClick(e){const b=e.target.closest?.('button');if(!b)return;if(b.dataset.cwTime)setTimeout(()=>setTimeframe(b.dataset.cwTime),0);const k=b.dataset.cwNative;if(k){setTimeout(()=>{if(k==='CANDLES')state.chartType='candles';else if(k==='LINE')state.chartType='line';else if(k==='VOLUME')state.showVolume=!state.showVolume;else if(k==='MA')state.showMA=!state.showMA;else if(k==='EMA')state.showEMA=!state.showEMA;render();},0);}}
function hook(name){const fn=window[name];if(typeof fn!=='function'||fn.__embeddedDomainChartV1)return;const w=function(){const out=fn.apply(this,arguments);setTimeout(()=>{const prev=state.symbol;mount();const next=inferSymbol();if(next!==prev)loadBars({reset:true});},0);return out;};w.__embeddedDomainChartV1=true;w.__embeddedDomainOriginal=fn;window[name]=w;}
function start(){document.addEventListener('click',onWorkstationClick,false);['renderSymbolChart','renderPortfolio','refreshTradeTicket','showView'].forEach(hook);mount();setTimeout(mount,300);setTimeout(mount,1200);setInterval(()=>{['renderSymbolChart','renderPortfolio','refreshTradeTicket','showView'].forEach(hook);mount();},1800);state.refreshTimer=setInterval(()=>{if(state.viewport&&document.body.contains(state.viewport))loadBars({reset:false});},5000);window.addEventListener('resize',()=>{state.lastSize='';render();},{passive:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
