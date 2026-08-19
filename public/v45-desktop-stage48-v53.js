(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage48V53)return;window.__sbcDesktopStage48V53=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toUpperCase();
function findOriginal(v,label){
  const candidates=$$('section,article,div,button',v).filter(x=>!x.closest('.stage47-analysis-strip-v52')&&!x.classList.contains('stage48-analytics-proxy-v53'));
  return candidates.find(x=>{const t=norm(x.textContent);return t.startsWith(label)&&x.children.length<14;})||null;
}
function proxy(slot,kind,title,subtitle,icon,original){
  let b=$(`[data-stage48-proxy="${kind}"]`,slot);
  if(!b){b=document.createElement('button');b.type='button';b.className='stage48-analytics-proxy-v53';b.dataset.stage48Proxy=kind;b.innerHTML=`<span class="stage48-icon-v53" aria-hidden="true">${icon}</span><span><b>${title}</b><span>${subtitle}</span></span>`;slot.appendChild(b);}
  b.onclick=()=>{if(original){original.classList.remove('stage48-original-analysis-v53');try{original.click();}finally{setTimeout(()=>original.classList.add('stage48-original-analysis-v53'),0);}}};
}
function enhance(){
  const v=$('#view-portfolio');if(!v)return;
  const metrics=$('.contest-metrics-strip-v46',v)||$('.header-metrics-v45',v);if(!metrics)return;
  metrics.classList.add('stage47-header-metrics-v52');
  let slot=$('.stage47-analysis-strip-v52',metrics);if(!slot){slot=document.createElement('div');slot.className='stage47-analysis-strip-v52';metrics.appendChild(slot);}
  // Undo Stage 47's physical reparenting before hiding originals.
  const moved=$$('.stage47-analysis-card-v52,.stage43-analysis-card-v48',slot);
  let old=$('.stage43-analysis-bottom-v48',v);
  if(!old){old=document.createElement('section');old.className='stage43-analysis-bottom-v48 stage47-retired-analysis-bottom-v52';old.innerHTML='<div></div>';metrics.after(old);}
  let host=$(':scope>div',old);if(!host){host=document.createElement('div');old.appendChild(host);}
  moved.forEach(c=>host.appendChild(c));
  const portfolio=findOriginal(v,'PORTFOLIO ANALYTICS')||moved[0]||null;
  const advanced=findOriginal(v,'ADVANCED PERFORMANCE CHARTS')||moved[1]||null;
  [portfolio,advanced].filter(Boolean).forEach(c=>c.classList.add('stage48-original-analysis-v53'));
  proxy(slot,'portfolio','PORTFOLIO ANALYTICS','Equity curve • allocation • P&L drivers','📊',portfolio);
  proxy(slot,'advanced','ADVANCED PERFORMANCE CHARTS','Prize-line pressure, cash deployment and what moved your rank','📊',advanced);
  // Remove any leftover Stage 47 full cards from the visible slot.
  $$('.stage47-analysis-card-v52,.stage43-analysis-card-v48',slot).forEach(c=>{if(!c.classList.contains('stage48-analytics-proxy-v53'))host.appendChild(c);});
}
function start(){enhance();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,40)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();