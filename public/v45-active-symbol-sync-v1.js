(()=>{
'use strict';
if(typeof window==='undefined'||window.__sbcActiveSymbolSyncV1)return;window.__sbcActiveSymbolSyncV1=true;
const norm=s=>String(s||'').trim().toUpperCase();
const valid=s=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s);
const TF_MAP={'1S':'tick','1M':'1m','5M':'5m','15M':'15m','1H':'1h','1D':'1D'};
let last='',recoverQueued=false;
function emit(symbol,source){
  const sym=norm(symbol);if(!valid(sym))return false;
  last=sym;
  window.dispatchEvent(new CustomEvent('sbc:active-symbol-change',{detail:{symbol:sym,source:source||'unknown'}}));
  return true;
}
function installSetterBridge(){
  const fn=window.selectChartSymbol;
  if(typeof fn!=='function'||fn.__sbcActiveSymbolSyncV1)return false;
  const wrapped=function(sym,source){
    const normalized=norm(sym);
    const out=fn.apply(this,[normalized]);
    emit(normalized,source||'workspace');
    return out;
  };
  wrapped.__sbcActiveSymbolSyncV1=true;
  wrapped.__sbcActiveSymbolOriginal=fn;
  window.selectChartSymbol=wrapped;
  return true;
}
function installTickCandleBridge(){
  const fn=window.generateOHLC;
  if(typeof fn!=='function'||fn.__sbcTickCandleBridgeV1)return false;
  const wrapped=function(){
    const raw=fn.apply(this,arguments),tf=norm(arguments[1]);
    if(!Array.isArray(raw)||(tf!=='TICK'&&tf!=='1S'))return raw;
    return raw.map((b,i,a)=>{
      const out={...b};
      const o=Number(b.o??b.open),rawClose=Number(b.c??b.close),nextOpen=Number(a[i+1]?.o??a[i+1]?.open);
      if(!Number.isFinite(o))return out;
      let c=rawClose;
      if(!Number.isFinite(c)||Math.abs(c-o)<Math.max(.005,Math.abs(o)*.00005)){
        c=Number.isFinite(nextOpen)&&Math.abs(nextOpen-o)>=Math.max(.005,Math.abs(o)*.00005)
          ?nextOpen
          :o*(1+(i%2===0?.0008:-.0008));
      }
      const pad=Math.max(.01,Math.abs(o)*.00035);
      const h=Math.max(Number(b.h??b.high)||-Infinity,o,c)+pad;
      const l=Math.min(Number(b.l??b.low)||Infinity,o,c)-pad;
      if('open'in b||'close'in b){out.open=o;out.close=Number(c.toFixed(2));out.high=Number(h.toFixed(2));out.low=Number(l.toFixed(2));}
      out.o=o;out.c=Number(c.toFixed(2));out.h=Number(h.toFixed(2));out.l=Number(l.toFixed(2));
      return out;
    });
  };
  wrapped.__sbcTickCandleBridgeV1=true;wrapped.__sbcTickCandleOriginal=fn;window.generateOHLC=wrapped;return true;
}
function onChange(e){
  const el=e.target;
  if(!el||el.id!=='tradeSymbol')return;
  const sym=norm(el.value);if(!valid(sym))return;
  emit(sym,'chart-selector');
}
function timeframeForButton(button){
  if(!button)return'';
  return TF_MAP[norm(button.dataset?.cwTime||button.textContent)]||'';
}
function matureOwnsChart(){
  const api=window.SBCMatureChartV1,state=api?.state;
  return !!(api&&state?.host&&document.body.contains(state.host)&&state.host.classList.contains('is-ready'));
}
function markTimeframeActive(button){
  const toolbar=button.closest('.chart-toolbar,.chart-workstation-v1');if(!toolbar)return;
  [...toolbar.querySelectorAll('button')].forEach(b=>{
    if(!timeframeForButton(b))return;
    const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');
  });
}
function guardMatureTimeframeClick(e){
  const button=e.target?.closest?.('#view-portfolio .chart-toolbar button,#view-portfolio .chart-workstation-v1 button');
  if(!button)return;
  const tf=timeframeForButton(button);if(!tf||!matureOwnsChart())return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  markTimeframeActive(button);
  window.SBCMatureChartV1.setTimeframe(tf);
}
function guardMatureStyleClick(e){
  const button=e.target?.closest?.('#view-portfolio .chart-workstation-v1 button[data-cw-native]');
  if(!button||!matureOwnsChart())return;
  const style=norm(button.dataset.cwNative);if(style!=='CANDLES'&&style!=='LINE')return;
  const state=window.SBCMatureChartV1?.state;if(!state?.candles||!state?.line)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  state.chartType=style==='LINE'?'line':'candles';
  state.candles.applyOptions({visible:state.chartType==='candles'});
  state.line.applyOptions({visible:state.chartType==='line'});
  document.querySelectorAll('#view-portfolio .chart-workstation-v1 [data-cw-native="CANDLES"],#view-portfolio .chart-workstation-v1 [data-cw-native="LINE"]').forEach(b=>{
    const active=norm(b.dataset.cwNative)===style;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');
  });
  button.closest('details')?.removeAttribute('open');
}
function recoverChartOwnership(){
  const viewport=document.querySelector('#view-portfolio .stage45-chart-viewport-v50.sbc-mature-chart-active-v1');
  if(!viewport)return;
  const readyHost=viewport.querySelector('.sbc-mature-chart-host-v1.is-ready');
  if(readyHost&&document.body.contains(readyHost))return;
  viewport.classList.remove('sbc-mature-chart-active-v1');
  if(recoverQueued)return;recoverQueued=true;
  requestAnimationFrame(()=>{
    recoverQueued=false;
    const sym=norm(document.getElementById('tradeSymbol')?.value||last);
    if(valid(sym))emit(sym,'chart-owner-recover');
  });
}
function start(){
  installSetterBridge();installTickCandleBridge();
  document.addEventListener('change',onChange,false);
  document.addEventListener('click',guardMatureTimeframeClick,true);
  document.addEventListener('click',guardMatureStyleClick,true);
  new MutationObserver(recoverChartOwnership).observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>{installSetterBridge();installTickCandleBridge();},0);
  setTimeout(()=>{installSetterBridge();installTickCandleBridge();},500);
  setTimeout(recoverChartOwnership,700);
  const initial=norm(document.getElementById('tradeSymbol')?.value);
  if(valid(initial))emit(initial,'initial');
}
window.SBCActiveSymbolV1={emit,get current(){return last;},installSetterBridge,installTickCandleBridge,recoverChartOwnership};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
