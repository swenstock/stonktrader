(()=>{
'use strict';
if(window.__sbcMobileNativeRefineV44)return;window.__sbcMobileNativeRefineV44=true;
const mq=matchMedia('(max-width:760px)');
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let positionBefore={},timer=null;
function mobile(){return mq.matches}
function symbolOfRow(r){return (r?.querySelector('td')?.textContent||'').trim().toUpperCase()}
function snapshotPositions(){const out={};$$('#portfolioHoldings tr').forEach(r=>{const sym=symbolOfRow(r);if(sym)out[sym]=(r.textContent||'').replace(/\s+/g,' ').trim()});return out}
function rememberPositions(){if(mobile())positionBefore=snapshotPositions()}
function flashChangedPositions(){
  if(!mobile())return;const now=snapshotPositions();Object.entries(now).forEach(([sym,val])=>{if(positionBefore[sym]&&positionBefore[sym]!==val){const card=$$('#sbcM43PositionCards .sbc-m43-position-card').find(x=>(x.querySelector('.sbc-m43-position-symbol b')?.textContent||'').trim().toUpperCase()===sym);if(card){card.classList.remove('sbc-m43-reconnect-flash');void card.offsetWidth;card.classList.add('sbc-m43-reconnect-flash');setTimeout(()=>card.classList.remove('sbc-m43-reconnect-flash'),1400)}}});positionBefore=now;
}
function normalizeInputs(){if(!mobile())return;$$('#view-portfolio input[type="number"],#view-exchange input[type="number"],#view-portfolio input[type="text"],#view-exchange input[type="text"]').forEach(i=>{if(!i.inputMode)i.inputMode='decimal'});}
function blockNewTradeButtons(block){if(!mobile())return;$$('#view-portfolio .quick-action,#view-portfolio #submitTradeBtn').forEach(b=>{if(block){if(!b.disabled){b.disabled=true;b.dataset.m44NetworkDisabled='1'}b.setAttribute('aria-disabled','true')}else if(b.dataset.m44NetworkDisabled==='1'){b.disabled=false;b.removeAttribute('data-m44-network-disabled');b.removeAttribute('aria-disabled')}});}
function enforceNetworkTruth(){if(!mobile())return;const body=document.body,badge=$('#sbcM43Connection');if(!navigator.onLine){body.classList.add('sbc-m43-stale');body.classList.remove('sbc-m43-reconnecting');if(badge)badge.textContent='OFFLINE';blockNewTradeButtons(true);return}const blocked=body.classList.contains('sbc-m43-stale')||body.classList.contains('sbc-m43-reconnecting');blockNewTradeButtons(blocked);}
function killSymbolSheet(e){e?.preventDefault?.();e?.stopPropagation?.();e?.stopImmediatePropagation?.();$('#sbcM43SymbolSheet')?.remove();}
function wireSymbolClose(){const close=$('#sbcM43SymbolSheet .close');if(!close||close.dataset.m44Wired)return;close.dataset.m44Wired='1';close.addEventListener('pointerup',killSymbolSheet,true);close.addEventListener('click',killSymbolSheet,true);close.onclick=killSymbolSheet;}
function destroySymbolSheetOnEscape(e){if(e.key!=='Escape'||!$('#sbcM43SymbolSheet'))return;e.preventDefault();$('#sbcM43SymbolSheet')?.remove();}
function run(){if(!mobile())return;wireSymbolClose();normalizeInputs();enforceNetworkTruth()}
function schedule(){clearTimeout(timer);timer=setTimeout(run,250)}
document.addEventListener('keydown',destroySymbolSheetOnEscape,true);
addEventListener('offline',()=>{rememberPositions();setTimeout(enforceNetworkTruth,0);setTimeout(enforceNetworkTruth,150)});
addEventListener('online',()=>{const wait=()=>{if(!mobile())return;const badge=$('#sbcM43Connection');if(badge&&/LIVE DATA|SERVER LIVE/.test(badge.textContent||'')){flashChangedPositions();return}setTimeout(wait,350)};setTimeout(wait,500)});
document.addEventListener('visibilitychange',()=>{if(document.hidden)rememberPositions();else{const wait=()=>{const badge=$('#sbcM43Connection');if(badge&&/LIVE DATA|SERVER LIVE/.test(badge.textContent||'')){flashChangedPositions();return}setTimeout(wait,350)};setTimeout(wait,500)}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(()=>{wireSymbolClose();schedule()}).observe(document.documentElement,{childList:true,subtree:true});
setInterval(enforceNetworkTruth,500);
})();