(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage49V54)return;window.__sbcDesktopStage49V54=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toUpperCase();
function findOriginal(v,label){
  const all=$$('section,article,div,details',v).filter(x=>!x.closest('.stage47-analysis-strip-v52')&&!x.classList.contains('stage49-live-control-v54'));
  return all.find(x=>norm(x.textContent).startsWith(label)&&x.children.length<16)||null;
}
function findAction(original){
  if(!original)return null;
  if(original.matches('button,summary,[role="button"]'))return original;
  const actions=$$('button,summary,[role="button"]',original);
  return actions.find(x=>/EXPAND|COLLAPSE|PORTFOLIO|ADVANCED|ANALYTICS|PERFORMANCE|CHART/.test(norm(x.textContent)))||actions[0]||null;
}
function makeCell(slot,kind,title){
  let cell=$(`[data-stage49-cell="${kind}"]`,slot);
  if(!cell){cell=document.createElement('div');cell.className='stage49-live-cell-v54';cell.dataset.stage49Cell=kind;cell.dataset.stage49Title=title;slot.appendChild(cell);}
  return cell;
}
function rehome(slot,kind,title,original){
  if(!original)return;
  original.classList.add('stage49-original-shell-v54');
  const action=findAction(original);if(!action)return;
  const cell=makeCell(slot,kind,title);
  action.classList.add('stage49-live-control-v54');
  action.dataset.stage49Kind=kind;
  if(action.parentElement!==cell)cell.appendChild(action);
  // The live node itself is moved: existing listeners/state stay attached; no proxy click indirection.
}
function enhance(){
  const v=$('#view-portfolio');if(!v)return;
  const metrics=$('.contest-metrics-strip-v46',v)||$('.header-metrics-v45',v);if(!metrics)return;
  metrics.classList.add('stage47-header-metrics-v52','stage49-header-metrics-v54');
  let slot=$('.stage47-analysis-strip-v52',metrics);if(!slot){slot=document.createElement('div');slot.className='stage47-analysis-strip-v52';metrics.appendChild(slot);}
  slot.classList.add('stage49-live-strip-v54');
  // Remove Stage 48 proxy buttons completely.
  $$('.stage48-analytics-proxy-v53',slot).forEach(x=>x.remove());
  // If Stage 47/48 reinserted full analytics cards into the strip, move them back out first.
  let retired=$('.stage43-analysis-bottom-v48',v);if(!retired){retired=document.createElement('section');retired.className='stage43-analysis-bottom-v48 stage47-retired-analysis-bottom-v52';retired.innerHTML='<div></div>';metrics.after(retired);}
  let host=$(':scope>div',retired);if(!host){host=document.createElement('div');retired.appendChild(host);}
  $$('.stage47-analysis-card-v52,.stage43-analysis-card-v48',slot).forEach(c=>{if(!c.classList.contains('stage49-live-cell-v54'))host.appendChild(c);});
  const portfolio=findOriginal(v,'PORTFOLIO ANALYTICS');
  const advanced=findOriginal(v,'ADVANCED PERFORMANCE CHARTS');
  rehome(slot,'portfolio','PORTFOLIO ANALYTICS',portfolio);
  rehome(slot,'advanced','ADVANCED PERFORMANCE CHARTS',advanced);
  // Remove empty/duplicate old shells from presentation while preserving them for their live content/state.
  [portfolio,advanced].filter(Boolean).forEach(x=>x.classList.add('stage49-original-shell-v54'));
}
function start(){enhance();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,30)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,700);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();