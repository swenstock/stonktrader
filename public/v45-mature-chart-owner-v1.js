(()=>{
'use strict';

const isBrowser=typeof window!=='undefined'&&typeof document!=='undefined';
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const norm=s=>String(s||'').trim().toUpperCase();
const validSymbol=s=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(norm(s));
const TF_MAP={TICK:'tick','1S':'tick','1M':'1m','5M':'5m','15M':'15m','1H':'1h','1D':'1D'};
const DEFAULT_VISIBLE={tick:46,'1m':44,'5m':42,'15m':40,'1h':36,'1D':32};
function normalizeTimeframe(tf){return TF_MAP[norm(tf)]||String(tf||'5m');}
function priceWheelFactor(current,deltaY){return clamp(Number(current||1)*Math.exp(clamp(Number(deltaY)||0,-180,180)*0.0018),.35,3.5);}
function boundedLogicalRange(range,barCount){
  const from=Number(range?.from),to=Number(range?.to),count=Math.max(0,Math.floor(Number(barCount)||0));
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||!count)return range||null;
  const span=to-from,last=count-1,minVisible=Math.min(count,Math.max(4,Math.min(12,Math.ceil(span*.22))));
  let nextFrom=from,nextTo=to;
  const latestAllowedFrom=last-(minVisible-1);
  if(nextFrom>latestAllowedFrom){const shift=nextFrom-latestAllowedFrom;nextFrom-=shift;nextTo-=shift;}
  const earliestAllowedTo=minVisible-1;
  if(nextTo<earliestAllowedTo){const shift=earliestAllowedTo-nextTo;nextFrom+=shift;nextTo+=shift;}
  return{from:nextFrom,to:nextTo};
}
function mapApiBars(bars){
  const seen=new Set();
  return(Array.isArray(bars)?bars:[]).map(b=>{
    const ms=new Date(b.time??b.t??Date.now()).getTime();
    return{time:Math.floor(ms/1000),open:Number(b.open??b.o),high:Number(b.high??b.h),low:Number(b.low??b.l),close:Number(b.close??b.c),volume:Number(b.volume??b.v??0)};
  }).filter(b=>[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&!seen.has(b.time)&&(seen.add(b.time),true)).sort((a,b)=>a.time-b.time);
}
function smaData(bars,period=20){const out=[];let sum=0;for(let i=0;i<bars.length;i++){sum+=bars[i].close;if(i>=period)sum-=bars[i-period].close;if(i>=period-1)out.push({time:bars[i].time,value:sum/period});}return out;}
function emaData(bars,period=20){if(!bars.length)return[];const out=[],k=2/(period+1);let ema=bars[0].close;for(const b of bars){ema=b.close*k+ema*(1-k);out.push({time:b.time,value:ema});}return out;}
const exported={normalizeTimeframe,priceWheelFactor,boundedLogicalRange,mapApiBars,smaData,emaData};
if(typeof module!=='undefined'&&module.exports)module.exports=exported;
if(!isBrowser||!window.matchMedia('(min-width:901px)').matches||window.__sbcMatureChartOwnerLoadedV1)return;
window.__sbcMatureChartOwnerLoadedV1=true;
window.__sbcMatureChartOwnerV1=true;

const $=(s,r=document)=>r?.querySelector?.(s)||null,$$=(s,r=document)=>r?[...r.querySelectorAll(s)]:[];
const state={
  card:null,viewport:null,host:null,chart:null,candles:null,line:null,volume:null,ma:null,ema:null,
  symbol:'',timeframe:'5m',bars:[],requestSeq:0,loading:false,userMoved:false,priceFactor:1,
  chartType:'candles',showVolume:true,showMA:false,showEMA:false,refreshTimer:0,showViewOriginal:null,rangeGuard:false
};
function card(){return $('#view-portfolio .chart-trade-card');}
function nativeSurface(c=card()){
  return $$('.symbol-chart canvas,.symbol-chart svg,.chart-canvas canvas,.chart-canvas svg,canvas,svg',c)
    .filter(x=>!x.closest('.chart-drawing-overlay-v1')&&!x.closest('.stage43-chart-controls-v48'))
    .sort((a,b)=>(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight))[0]||null;
}
function findViewport(c=card()){
  if(!c)return null;
  const known=$('.stage45-chart-viewport-v50',c);if(known)return known;
  const s=nativeSurface(c);if(!s)return null;
  let p=s.parentElement;
  while(p&&p!==c&&p!==document.body){const r=p.getBoundingClientRect();if(r.width>420&&r.height>150)return p;p=p.parentElement;}
  return s.parentElement||null;
}
function currentSymbol(){const sym=norm(document.getElementById('tradeSymbol')?.value);return validSymbol(sym)?sym:'';}
function currentTimeframe(){
  const bar=$('.chart-workstation-v1',card());
  const active=bar&&$$('[data-cw-time]',bar).find(b=>b.classList.contains('active'));
  if(active)return normalizeTimeframe(active.dataset.cwTime||active.textContent);
  const tb=$('.chart-toolbar',card());
  const native=tb&&$$('button',tb).find(b=>b.classList.contains('active')||b.getAttribute('aria-pressed')==='true'||b.dataset.active==='true');
  return normalizeTimeframe(native?.textContent||state.timeframe);
}
function syntheticTickBars(symbol){
  try{
    if(typeof window.generateOHLC!=='function')return[];
    const raw=window.generateOHLC(symbol,'tick'),now=Math.floor(Date.now()/1000);
    return(Array.isArray(raw)?raw:[]).map((b,i,a)=>({time:now-(a.length-1-i),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c),volume:Number(b.v||0)})).filter(b=>[b.open,b.high,b.low,b.close].every(Number.isFinite));
  }catch(_){return[];}
}
function status(text){const el=$('.sbc-mature-chart-status-v1',state.host);if(el)el.textContent=text||'';}
function matureReady(ready){
  if(!state.host||!state.viewport)return;
  state.host.classList.toggle('is-ready',!!ready);
  state.viewport.classList.toggle('sbc-mature-chart-active-v1',!!ready);
}
function priceAutoscaleProvider(baseImplementation){
  const info=baseImplementation?.();
  const range=info?.priceRange;if(!range)return info;
  const min=Number(range.minValue),max=Number(range.maxValue);if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return info;
  const center=(min+max)/2,span=(max-min)*state.priceFactor;
  return{...info,priceRange:{minValue:center-span/2,maxValue:center+span/2}};
}
function applyPriceFactor(){
  const opts={autoscaleInfoProvider:priceAutoscaleProvider};
  state.candles?.applyOptions(opts);state.line?.applyOptions(opts);
}
function setSeriesVisibility(){
  state.candles?.applyOptions({visible:state.chartType!=='line'});
  state.line?.applyOptions({visible:state.chartType==='line'});
  state.volume?.applyOptions({visible:state.showVolume});
  state.ma?.applyOptions({visible:state.showMA});
  state.ema?.applyOptions({visible:state.showEMA});
}
function setSeriesData(bars,{reset=false}={}){
  if(!state.chart||!bars.length)return false;
  const ts=state.chart.timeScale();
  const prior=state.userMoved?ts.getVisibleLogicalRange():null;
  state.candles.setData(bars.map(({time,open,high,low,close})=>({time,open,high,low,close})));
  state.line.setData(bars.map(b=>({time:b.time,value:b.close})));
  state.volume.setData(bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'rgba(46,230,166,.30)':'rgba(255,93,93,.30)'})));
  state.ma.setData(smaData(bars));state.ema.setData(emaData(bars));
  applyPriceFactor();setSeriesVisibility();
  if(reset||!prior){
    const n=Math.min(bars.length,DEFAULT_VISIBLE[state.timeframe]||42);
    ts.setVisibleLogicalRange({from:Math.max(-6,bars.length-n-.5),to:bars.length-1+6});
    state.userMoved=false;
  }else{
    ts.setVisibleLogicalRange(boundedLogicalRange(prior,bars.length));
  }
  matureReady(true);return true;
}
async function loadBars({reset=false}={}){
  const symbol=state.symbol||currentSymbol();if(!validSymbol(symbol)||!state.chart)return false;
  const seq=++state.requestSeq,tf=state.timeframe;state.loading=true;status(`Loading ${symbol} ${tf}…`);
  let bars=[];
  try{
    if(tf==='tick')bars=syntheticTickBars(symbol);
    else{
      const r=await fetch(`/api/quotes/bars?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(tf)}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`bars ${r.status}`);
      const d=await r.json();bars=mapApiBars(d.bars);
    }
  }catch(e){
    if(seq===state.requestSeq){status('Chart data unavailable — SBC chart retained');matureReady(false);}
    console.warn('[mature-chart-owner]',e?.message||e);return false;
  }finally{if(seq===state.requestSeq)state.loading=false;}
  if(seq!==state.requestSeq)return false;
  if(!bars.length){status('No bars returned — SBC chart retained');matureReady(false);return false;}
  state.bars=bars;setSeriesData(bars,{reset});status(`${symbol} · ${tf}`);return true;
}
function setSymbol(symbol,{source='unknown',reset=true}={}){
  const sym=norm(symbol);if(!validSymbol(sym))return false;
  if(sym===state.symbol&&state.bars.length&&!reset)return true;
  state.symbol=sym;state.userMoved=false;state.priceFactor=1;
  return loadBars({reset:true,source});
}
function setTimeframe(tf){
  const next=normalizeTimeframe(tf);if(!DEFAULT_VISIBLE[next])return false;
  if(next===state.timeframe&&state.bars.length)return true;
  state.timeframe=next;state.userMoved=false;state.priceFactor=1;loadBars({reset:true});return true;
}
function fit(){if(!state.chart||!state.bars.length)return;state.userMoved=false;state.priceFactor=1;applyPriceFactor();setSeriesData(state.bars,{reset:true});}
function enforceViewportBounds(range){
  if(state.rangeGuard||!state.chart||!state.bars.length||!range)return;
  const bounded=boundedLogicalRange(range,state.bars.length);if(!bounded)return;
  if(Math.abs(bounded.from-range.from)<.01&&Math.abs(bounded.to-range.to)<.01)return;
  state.rangeGuard=true;
  try{state.chart.timeScale().setVisibleLogicalRange(bounded);}finally{state.rangeGuard=false;}
}
function createChart(v){
  if(!window.LightweightCharts?.createChart)return false;
  const host=document.createElement('div');host.className='sbc-mature-chart-host-v1';host.hidden=false;host.innerHTML='<div class="sbc-mature-chart-status-v1">Loading chart…</div>';v.appendChild(host);
  const chart=window.LightweightCharts.createChart(host,{
    autoSize:true,
    layout:{background:{type:'solid',color:'#0b1017'},textColor:'#93a4b2',fontFamily:'Inter,system-ui,sans-serif',fontSize:10},
    grid:{vertLines:{color:'rgba(116,136,156,.15)'},horzLines:{color:'rgba(116,136,156,.15)'}},
    rightPriceScale:{visible:true,borderColor:'#24313d',entireTextOnly:true,autoScale:true,scaleMargins:{top:.08,bottom:.18}},
    leftPriceScale:{visible:false},
    timeScale:{borderColor:'#24313d',rightOffset:6,barSpacing:11,minBarSpacing:2,timeVisible:true,secondsVisible:false,fixLeftEdge:false,fixRightEdge:false,lockVisibleTimeRangeOnResize:true},
    crosshair:{mode:0,vertLine:{color:'rgba(181,196,207,.42)',width:1,style:3,labelBackgroundColor:'#18242e'},horzLine:{color:'rgba(181,196,207,.42)',width:1,style:3,labelBackgroundColor:'#18242e'}},
    handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:{time:true,price:true},axisDoubleClickReset:{time:true,price:true}},
    kineticScroll:{mouse:false,touch:true}
  });
  const candles=chart.addCandlestickSeries({upColor:'#2ee6a6',downColor:'#ff5d5d',wickUpColor:'#2ee6a6',wickDownColor:'#ff5d5d',borderVisible:false,priceLineVisible:true,lastValueVisible:true});
  const line=chart.addLineSeries({color:'#ffc928',lineWidth:2,visible:false,priceLineVisible:true,lastValueVisible:true});
  const volume=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'',visible:true,lastValueVisible:false,priceLineVisible:false});
  volume.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});
  const ma=chart.addLineSeries({color:'#f3c748',lineWidth:1,visible:false,priceLineVisible:false,lastValueVisible:false});
  const ema=chart.addLineSeries({color:'#5ec7ff',lineWidth:1,visible:false,priceLineVisible:false,lastValueVisible:false});
  Object.assign(state,{host,chart,candles,line,volume,ma,ema});
  chart.timeScale().subscribeVisibleLogicalRangeChange(enforceViewportBounds);
  host.addEventListener('pointerdown',e=>{const r=host.getBoundingClientRect();if(e.clientX-r.left<r.width-72)state.userMoved=true;},{capture:true});
  host.addEventListener('wheel',e=>{
    const r=host.getBoundingClientRect(),x=e.clientX-r.left;
    if(x>=r.width-72){
      e.preventDefault();e.stopPropagation();
      state.priceFactor=priceWheelFactor(state.priceFactor,e.deltaY);applyPriceFactor();
      chart.priceScale('right').applyOptions({autoScale:true});
      return;
    }
    state.userMoved=true;
  },{capture:true,passive:false});
  host.addEventListener('dblclick',e=>{const r=host.getBoundingClientRect();if(e.clientX-r.left>=r.width-72){state.priceFactor=1;applyPriceFactor();chart.priceScale('right').applyOptions({autoScale:true});}},{capture:true});
  return true;
}
function ensureMounted(){
  if(state.host&&document.body.contains(state.host)&&state.chart)return true;
  const c=card(),v=findViewport(c);if(!c||!v)return false;
  if(!window.LightweightCharts?.createChart){console.error('[mature-chart-owner] LightweightCharts bundle missing; retaining SBC chart');return false;}
  state.card=c;state.viewport=v;v.classList.add('stage45-chart-viewport-v50');
  if(!createChart(v))return false;
  const sym=currentSymbol();if(validSymbol(sym))state.symbol=sym;
  state.timeframe=currentTimeframe();
  loadBars({reset:true});
  window.SBCChartViewportV50={fit,resetTime:fit,resetPrice(){state.priceFactor=1;applyPriceFactor();state.chart?.priceScale('right').applyOptions({autoScale:true});},repaint(){},repaintPrice(){},apply(){},state};
  window.SBCMatureChartV1={setSymbol,setTimeframe,fit,loadBars,state};
  return true;
}
function onSymbolChange(e){const symbol=norm(e?.detail?.symbol);if(!validSymbol(symbol))return;ensureMounted();setSymbol(symbol,{source:e.detail?.source||'event',reset:true});}
function onWorkspaceClick(e){
  const b=e.target.closest?.('button');if(!b)return;
  if(b.dataset.cwTime){setTimeout(()=>setTimeframe(b.dataset.cwTime),0);return;}
  const k=b.dataset.cwNative;if(!k)return;
  setTimeout(()=>{
    if(k==='CANDLES')state.chartType='candles';
    else if(k==='LINE')state.chartType='line';
    else if(k==='VOLUME')state.showVolume=!state.showVolume;
    else if(k==='MA')state.showMA=!state.showMA;
    else if(k==='EMA')state.showEMA=!state.showEMA;
    setSeriesVisibility();
  },0);
}
function installShowViewHook(){
  const fn=window.showView;if(typeof fn!=='function'||fn.__sbcMatureChartOwnerV1)return false;
  const wrapped=function(){const out=fn.apply(this,arguments);const view=String(arguments[0]||'');if(view==='portfolio'||view==='trade')setTimeout(ensureMounted,0);return out;};
  wrapped.__sbcMatureChartOwnerV1=true;wrapped.__sbcMatureChartOriginal=fn;window.showView=wrapped;state.showViewOriginal=fn;return true;
}
function start(){
  window.addEventListener('sbc:active-symbol-change',onSymbolChange);
  document.addEventListener('click',onWorkspaceClick,false);
  installShowViewHook();
  ensureMounted();
  setTimeout(()=>{installShowViewHook();ensureMounted();},250);
  setTimeout(()=>ensureMounted(),900);
  state.refreshTimer=setInterval(()=>{if(state.chart&&state.host&&document.body.contains(state.host)&&state.symbol)loadBars({reset:false});},5000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
