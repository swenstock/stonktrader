(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage47V52)return;window.__sbcDesktopStage47V52=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toUpperCase();
function findCards(v){
  const marked=$$('.stage43-analysis-card-v48',v);
  if(marked.length>=2)return marked.slice(0,2);
  const all=$$('section,article,div',v).filter(x=>x.children.length&&x.children.length<12);
  const pa=all.find(x=>norm(x.textContent).startsWith('PORTFOLIO ANALYTICS'));
  const ap=all.find(x=>norm(x.textContent).startsWith('ADVANCED PERFORMANCE CHARTS'));
  return [pa,ap].filter(Boolean);
}
function enhance(){
  const v=$('#view-portfolio');if(!v)return;
  const metrics=$('.contest-metrics-strip-v46',v)||$('.header-metrics-v45',v);if(!metrics)return;
  metrics.classList.add('stage47-header-metrics-v52');
  let slot=$('.stage47-analysis-strip-v52',metrics);
  if(!slot){slot=document.createElement('div');slot.className='stage47-analysis-strip-v52';metrics.appendChild(slot);}
  const cards=findCards(v);
  cards.forEach((c,i)=>{c.classList.add('stage43-analysis-card-v48','stage47-analysis-card-v52',i===0?'stage47-portfolio-analytics-v52':'stage47-performance-v52');if(c.parentElement!==slot)slot.appendChild(c);});
  const old=$('.stage43-analysis-bottom-v48',v);if(old)old.classList.add('stage47-retired-analysis-bottom-v52');
}
function start(){enhance();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,25)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,900);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();