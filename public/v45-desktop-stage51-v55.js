(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage51V55)return;window.__sbcDesktopStage51V55=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toUpperCase();
const META={
  portfolio:{label:'PORTFOLIO ANALYTICS',sub:'Equity curve • allocation • P&L drivers',icon:'📊'},
  advanced:{label:'ADVANCED PERFORMANCE CHARTS',sub:'Prize-line pressure • cash deployment • rank drivers',icon:'📈'}
};
const NATIVE_SIGNATURES={
  portfolio:['EQUITY CURVE','ALLOCATION BREAKDOWN','P&L DRIVERS'],
  advanced:['VS. PRIZE LINE','CASH DEPLOYMENT','RANK MOVEMENT']
};
let current=null;
function ensureStash(v){let s=$('.stage51-native-stash-v55',v);if(!s){s=document.createElement('div');s.className='stage51-native-stash-v55';s.setAttribute('aria-hidden','true');v.appendChild(s);}return s;}
function addGuard(el){if(!el||$('.stage51-scan-guard-v55',el))return;const g=document.createElement('span');g.className='stage51-scan-guard-v55';g.textContent='\u200B';el.prepend(g);}
function hasNativeSignature(el,kind){
  if(!el)return false;const t=norm(el.textContent);return NATIVE_SIGNATURES[kind].every(x=>t.includes(x));
}
function promoteNativeModule(node,v,kind){
  let fallback=node;
  for(let p=node;p&&p!==v;p=p.parentElement){
    if(!hasNativeSignature(p,kind))continue;
    fallback=p;
    const controls=$$('button,summary,[role="button"]',p);
    if(p.matches('details')||controls.some(x=>/EXPAND|COLLAPSE/.test(norm(x.textContent))))return p;
  }
  return fallback;
}
function findNativeModule(v,kind){
  const candidates=$$('details,section,article,div',v).filter(x=>!x.closest('.stage51-header-strip-v55,.stage51-modal-v55,.stage51-native-stash-v55')&&hasNativeSignature(x,kind));
  if(!candidates.length)return null;
  candidates.sort((a,b)=>(a.querySelectorAll('*').length-b.querySelectorAll('*').length)||(a.textContent.length-b.textContent.length));
  return promoteNativeModule(candidates[0],v,kind);
}
function findSource(v,kind){
  const marked=$$('[data-stage51-source]').find(x=>x.dataset.stage51Source===kind);
  if(marked&&hasNativeSignature(marked,kind))return marked;
  if(marked){marked.removeAttribute('data-stage51-source');marked.classList.remove('stage51-native-source-v55','stage51-modal-source-v55');}
  return findNativeModule(v,kind);
}
function retireLegacyDescriptions(v){
  const stash=ensureStash(v);
  Object.keys(META).forEach(kind=>{
    const hits=$$('section,article,details,header,div',v).filter(x=>{
      if(x.closest('.stage51-header-strip-v55,.stage51-modal-v55,.stage51-native-stash-v55,[data-stage51-source]'))return false;
      const t=norm(x.textContent),count=x.querySelectorAll('*').length;
      return t.startsWith(META[kind].label)&&!hasNativeSignature(x,kind)&&t.length<=260&&count<=12;
    });
    hits.sort((a,b)=>(a.querySelectorAll('*').length-b.querySelectorAll('*').length)||(a.textContent.length-b.textContent.length));
    hits.forEach(x=>{x.classList.add('stage51-retired-description-v56');x.setAttribute('aria-hidden','true');if(x.parentElement!==stash)stash.appendChild(x);});
  });
}
function standardizeToggle(card){
  if(!card)return;
  const detail=card.matches('details')?card:$('details',card);
  let action=$$('button,summary,[role="button"]',card).find(x=>/EXPAND|COLLAPSE/.test(norm(x.textContent)));
  if(!action&&detail)action=$('summary',detail);
  if(!action)return;
  action.classList.add('stage53-standard-expand-toggle-v57');
  const sync=()=>{
    const expanded=detail?detail.open:/COLLAPSE/.test(norm(action.textContent));
    action.textContent=expanded?'COLLAPSE':'EXPAND';
    action.setAttribute('aria-expanded',expanded?'true':'false');
  };
  if(detail&&action.matches('summary'))detail.addEventListener('toggle',sync);
  else if(!action.dataset.stage53ToggleSync){action.dataset.stage53ToggleSync='1';action.addEventListener('click',()=>setTimeout(sync,0));}
  sync();
}
function captureOne(v,kind){
  const stash=ensureStash(v);let card=$(`[data-stage51-source="${kind}"]`);if(card&&!hasNativeSignature(card,kind)){card.removeAttribute('data-stage51-source');card.classList.remove('stage51-native-source-v55','stage51-modal-source-v55');card=null;}if(!card)card=findSource(v,kind);if(!card)return null;
  card.dataset.stage51Source=kind;card.classList.add('stage51-native-source-v55');card.classList.remove('stage52-retired-analytics-stray-v56');card.removeAttribute('aria-hidden');addGuard(card);standardizeToggle(card);
  $$('[data-stage51-source="'+kind+'"]').filter(x=>x!==card).forEach(x=>{x.removeAttribute('data-stage51-source');x.classList.remove('stage51-native-source-v55','stage51-modal-source-v55');});
  if(!card.closest('.stage51-modal-v55')&&card.parentElement!==stash)stash.appendChild(card);return card;
}
function captureSources(v){captureOne(v,'portfolio');captureOne(v,'advanced');retireLegacyDescriptions(v);const old=$('.stage43-analysis-bottom-v48',v);if(old)old.classList.add('stage51-retired-bottom-v55');}
function ensureModal(){
  let m=$('.stage51-modal-v55');if(m)return m;
  m=document.createElement('div');m.className='stage51-modal-v55';m.hidden=true;m.innerHTML='<section class="stage51-modal-panel-v55" role="dialog" aria-modal="true" aria-labelledby="stage51ModalTitle"><header><div><small>PORTFOLIO ANALYSIS</small><h2 id="stage51ModalTitle">ANALYTICS</h2></div><button type="button" class="stage51-modal-close-v55" aria-label="Close analytics">×</button></header><div class="stage51-modal-content-v55"></div></section>';
  document.body.appendChild(m);$('.stage51-modal-close-v55',m).onclick=closeModal;m.addEventListener('click',e=>{if(e.target===m)closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!m.hidden)closeModal();});return m;
}
function expandNative(card){
  if(card.matches('details'))card.open=true;$$('details',card).forEach(d=>d.open=true);standardizeToggle(card);
  const action=$$('button,[role="button"]',card).find(x=>norm(x.textContent)==='EXPAND');
  if(action)setTimeout(()=>{try{action.click();standardizeToggle(card);}catch{}},0);
}
function openModal(kind){
  const v=$('#view-portfolio');if(!v)return;captureSources(v);const card=$(`[data-stage51-source="${kind}"]`);const m=ensureModal(),content=$('.stage51-modal-content-v55',m),title=$('#stage51ModalTitle',m);title.textContent=META[kind].label;content.innerHTML='';
  if(!card||!hasNativeSignature(card,kind)){content.innerHTML='<div class="stage51-loading-v55">Analytics are still loading. Close and try again in a moment.</div>';current=null;}else{current=card;card.classList.remove('stage52-retired-analytics-stray-v56');card.removeAttribute('aria-hidden');card.classList.add('stage51-modal-source-v55');content.appendChild(card);expandNative(card);}
  m.hidden=false;document.body.classList.add('stage51-modal-open-v55');$('.stage51-modal-close-v55',m).focus();
}
function closeModal(){const m=$('.stage51-modal-v55');if(!m||m.hidden)return;const v=$('#view-portfolio'),stash=v&&ensureStash(v);if(current&&stash){current.classList.remove('stage51-modal-source-v55');stash.appendChild(current);}current=null;m.hidden=true;document.body.classList.remove('stage51-modal-open-v55');}
function button(kind){const d=META[kind],b=document.createElement('button');b.type='button';b.className='stage51-analysis-card-v55';b.dataset.stage51Analytics=kind;b.innerHTML=`<span class="stage51-scan-guard-v55">\u200B</span><span class="stage51-card-icon-v55" aria-hidden="true">${d.icon}</span><span class="stage51-card-copy-v55"><b>${d.label}</b><small>${d.sub}</small></span><span class="stage51-card-open-v55" aria-hidden="true">›</span>`;b.onclick=()=>openModal(kind);return b;}
function buildHeader(v){
  const metrics=$('.contest-metrics-strip-v46',v)||$('.header-metrics-v45',v);if(!metrics)return;
  metrics.classList.remove('stage47-header-metrics-v52','stage49-header-metrics-v54');metrics.classList.add('stage51-header-metrics-v55');
  $$('.stage47-analysis-strip-v52,.stage49-live-strip-v54',metrics).forEach(x=>x.remove());
  let strip=$('.stage51-header-strip-v55',metrics);if(!strip){strip=document.createElement('div');strip.className='stage51-header-strip-v55';strip.append(button('portfolio'),button('advanced'));metrics.appendChild(strip);}
}
function enhance(){const v=$('#view-portfolio');if(!v)return;buildHeader(v);captureSources(v);}
function start(){enhance();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,60)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,1500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();