(()=>{
'use strict';
if(window.__sbcMobileNativeRefineV44)return;window.__sbcMobileNativeRefineV44=true;
const mq=matchMedia('(max-width:760px)');
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let positionBefore={},timer=null,symbolSheetClosed=false;
function mobile(){return mq.matches}
function symbolOfRow(r){return (r?.querySelector('td')?.textContent||'').trim().toUpperCase()}
function snapshotPositions(){const out={};$$('#portfolioHoldings tr').forEach(r=>{const sym=symbolOfRow(r);if(sym)out[sym]=(r.textContent||'').replace(/\s+/g,' ').trim()});return out}
function rememberPositions(){if(mobile())positionBefore=snapshotPositions()}
function flashChangedPositions(){
  if(!mobile())return;const now=snapshotPositions();Object.entries(now).forEach(([sym,val])=>{if(positionBefore[sym]&&positionBefore[sym]!==val){const card=$$('#sbcM43PositionCards .sbc-m43-position-card').find(x=>(x.querySelector('.sbc-m43-position-symbol b')?.textContent||'').trim().toUpperCase()===sym);if(card){card.classList.remove('sbc-m43-reconnect-flash');void card.offsetWidth;card.classList.add('sbc-m43-reconnect-flash');setTimeout(()=>card.classList.remove('sbc-m43-reconnect-flash'),1400)}}});positionBefore=now;
}
function normalizeInputs(){
  if(!mobile())return;$$('#view-portfolio input[type="number"],#view-exchange input[type="number"],#view-portfolio input[type="text"],#view-exchange input[type="text"]').forEach(i=>{if(!i.inputMode)i.inputMode='decimal'});
}
function blockNewTradeButtons(block){
  if(!mobile())return;$$('#view-portfolio .quick-action,#view-portfolio #submitTradeBtn').forEach(b=>{if(block){if(!b.disabled){b.disabled=true;b.dataset.m44NetworkDisabled='1'}b.setAttribute('aria-disabled','true')}else if(b.dataset.m44NetworkDisabled==='1'){b.disabled=false;b.removeAttribute('data-m44-network-disabled');b.removeAttribute('aria-disabled')}});
}
function enforceNetworkTruth(){
  if(!mobile())return;const body=document.body,badge=$('#sbcM43Connection');
  if(!navigator.onLine){body.classList.add('sbc-m43-stale');body.classList.remove('sbc-m43-reconnecting');if(badge)badge.textContent='OFFLINE';blockNewTradeButtons(true);return}
  const blocked=body.classList.contains('sbc-m43-stale')||body.classList.contains('sbc-m43-reconnecting');blockNewTradeButtons(blocked);
}
function enforceSymbolSheet(){const sheet=$('#sbcM43SymbolSheet');if(!mobile()||!sheet)return;if(symbolSheetClosed&&sheet.classList.contains('open')){sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true')}}
function closeSymbolSheetHard(e){const close=e.target.closest?.('#sbcM43SymbolSheet .close');if(!close)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();symbolSheetClosed=true;const sheet=$('#sbcM43SymbolSheet');sheet?.classList.remove('open');sheet?.setAttribute('aria-hidden','true');queueMicrotask(enforceSymbolSheet);setTimeout(enforceSymbolSheet,50)}
function allowSymbolSheetOpen(e){const search=e.target.closest?.('#view-portfolio .clean-stock-picker button');if(search)symbolSheetClosed=false}
function run(){if(!mobile())return;normalizeInputs();enforceNetworkTruth();enforceSymbolSheet()}
function schedule(){clearTimeout(timer);timer=setTimeout(run,250)}
document.addEventListener('click',allowSymbolSheetOpen,true);
document.addEventListener('click',closeSymbolSheetHard,true);
addEventListener('offline',()=>{rememberPositions();setTimeout(enforceNetworkTruth,0);setTimeout(enforceNetworkTruth,150)});
addEventListener('online',()=>{const wait=()=>{if(!mobile())return;const badge=$('#sbcM43Connection');if(badge&&/LIVE DATA|SERVER LIVE/.test(badge.textContent||'')){flashChangedPositions();return}setTimeout(wait,350)};setTimeout(wait,500)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)rememberPositions();else{const wait=()=>{const badge=$('#sbcM43Connection');if(badge&&/LIVE DATA|SERVER LIVE/.test(badge.textContent||'')){flashChangedPositions();return}setTimeout(wait,350)};setTimeout(wait,500)}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-hidden']});
setInterval(enforceNetworkTruth,500);
})();