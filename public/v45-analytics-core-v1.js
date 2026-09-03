(()=>{
'use strict';
if(window.SBCAnalyticsCoreV1)return;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toUpperCase();
const NATIVE_SIGNATURES={
  portfolio:['EQUITY CURVE','ALLOCATION BREAKDOWN','P&L DRIVERS'],
  advanced:['VS. PRIZE LINE','CASH DEPLOYMENT','RANK MOVEMENT']
};
function ensureStash(v){let s=$('.stage51-native-stash-v55',v);if(!s){s=document.createElement('div');s.className='stage51-native-stash-v55';s.setAttribute('aria-hidden','true');v.appendChild(s);}return s;}
function hasNativeSignature(el,kind){if(!el||!NATIVE_SIGNATURES[kind])return false;const t=norm(el.textContent);return NATIVE_SIGNATURES[kind].every(x=>t.includes(x));}
function hasOtherNativeSignature(el,kind){return Object.keys(NATIVE_SIGNATURES).some(k=>k!==kind&&hasNativeSignature(el,k));}
function hasNativeToggle(el){
  if(!el)return false;
  if(el.matches('details'))return true;
  return $$('button,summary,[role="button"]',el).some(x=>/EXPAND|COLLAPSE/.test(norm(x.textContent)));
}
function ownsCorePortfolio(el,v){
  if(!el||!v||el===v)return true;
  const core=['.trading-workspace-v47','.stage43-workspace-v48','.chart-trade-card','.holdings-card','.orders-activity-card','.orders-activity-v45','.quick-trade-clean'];
  return core.some(s=>{const n=$(s,v);return !!n&&el.contains(n);});
}
function isSafeNativeModule(el,v,kind){return !!el&&hasNativeSignature(el,kind)&&!hasOtherNativeSignature(el,kind)&&!ownsCorePortfolio(el,v);}
function promoteNativeModule(node,v,kind){
  let outer=null,outerToggle=null;
  for(let p=node;p&&p!==v;p=p.parentElement){
    if(!isSafeNativeModule(p,v,kind))continue;
    outer=p;if(hasNativeToggle(p))outerToggle=p;
  }
  return outerToggle||outer;
}
function findNativeModule(v,kind){
  if(!v||!NATIVE_SIGNATURES[kind])return null;
  const candidates=$$('details,section,article,div',v).filter(x=>!x.closest('.stage51-header-strip-v55,.stage51-modal-v55,.stage51-native-stash-v55')&&hasNativeSignature(x,kind));
  if(!candidates.length)return null;
  candidates.sort((a,b)=>(a.querySelectorAll('*').length-b.querySelectorAll('*').length)||(a.textContent.length-b.textContent.length));
  for(const candidate of candidates){const promoted=promoteNativeModule(candidate,v,kind);if(promoted)return promoted;}
  return null;
}
function clearSourceMark(card){if(!card)return;card.removeAttribute('data-stage51-source');card.classList.remove('stage51-native-source-v55','stage51-modal-source-v55');}
function findSource(v,kind){
  if(!v||!NATIVE_SIGNATURES[kind])return null;
  const marked=$$('[data-stage51-source]').find(x=>x.dataset.stage51Source===kind);
  if(marked&&isSafeNativeModule(marked,v,kind))return marked;
  if(marked)clearSourceMark(marked);
  return findNativeModule(v,kind);
}
function capture(v,kind){
  if(!v||!NATIVE_SIGNATURES[kind])return null;
  const stash=ensureStash(v);let card=$(`[data-stage51-source="${kind}"]`);
  if(card&&!isSafeNativeModule(card,v,kind)){clearSourceMark(card);card=null;}
  if(!card)card=findSource(v,kind);if(!card)return null;
  card.dataset.stage51Source=kind;card.classList.add('stage51-native-source-v55');card.classList.remove('stage52-retired-analytics-stray-v56');card.removeAttribute('aria-hidden');
  $$(`[data-stage51-source="${kind}"]`).filter(x=>x!==card).forEach(clearSourceMark);
  if(!card.closest('.stage51-modal-v55')&&card.parentElement!==stash)stash.appendChild(card);
  return card;
}
function getCaptured(v,kind){const card=$(`[data-stage51-source="${kind}"]`);return isSafeNativeModule(card,v,kind)?card:null;}
function mount(v,kind,host){
  const card=capture(v,kind);if(!card||!host||!isSafeNativeModule(card,v,kind))return null;
  host.appendChild(card);return card;
}
function restore(v,card){
  if(!v||!card)return null;
  const kind=card.dataset.stage51Source;
  if(!kind||!isSafeNativeModule(card,v,kind))return null;
  const stash=ensureStash(v);card.classList.remove('stage51-modal-source-v55');stash.appendChild(card);return card;
}
window.SBCAnalyticsCoreV1={NATIVE_SIGNATURES,ensureStash,hasNativeSignature,hasOtherNativeSignature,ownsCorePortfolio,isSafeNativeModule,findNativeModule,findSource,capture,getCaptured,mount,restore};
})();
