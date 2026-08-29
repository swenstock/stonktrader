(()=>{
'use strict';
if(typeof window==='undefined'||window.__sbcActiveSymbolSyncV1)return;window.__sbcActiveSymbolSyncV1=true;
const norm=s=>String(s||'').trim().toUpperCase();
const valid=s=>/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s);
let last='';
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
function onChange(e){
  const el=e.target;
  if(!el||el.id!=='tradeSymbol')return;
  const sym=norm(el.value);if(!valid(sym))return;
  emit(sym,'chart-selector');
}
function start(){
  installSetterBridge();
  document.addEventListener('change',onChange,false);
  setTimeout(installSetterBridge,0);
  setTimeout(installSetterBridge,500);
  const initial=norm(document.getElementById('tradeSymbol')?.value);
  if(valid(initial))emit(initial,'initial');
}
window.SBCActiveSymbolV1={emit,get current(){return last;},installSetterBridge};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
