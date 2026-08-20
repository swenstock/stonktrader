(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage52V56)return;window.__sbcDesktopStage52V56=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toUpperCase();
const labels=['PORTFOLIO ANALYTICS','ADVANCED PERFORMANCE CHARTS'];
function retireStrays(v){
  const allowed=x=>x.closest('.stage51-header-strip-v55,.stage51-modal-v55,.stage51-native-stash-v55');
  const hits=$$('section,article,details,div,button',v).filter(x=>!allowed(x)&&labels.some(l=>norm(x.textContent).startsWith(l)));
  hits.sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
  hits.forEach(x=>{
    if(x===v||x.contains($('.trading-workspace-v47',v)))return;
    x.classList.add('stage52-retired-analytics-stray-v56');
    x.setAttribute('aria-hidden','true');
  });
}
function focusLayout(v){
  v.classList.add('stage52-desktop-focus-v56');
  const workspace=$('.trading-workspace-v47',v)||$('.stage43-workspace-v48',v);
  if(workspace)workspace.classList.add('stage52-primary-workspace-v56');
  const metrics=$('.stage51-header-metrics-v55',v)||$('.contest-metrics-strip-v46',v);
  if(metrics)metrics.classList.add('stage52-focus-anchor-v56');
}
function enhance(){const v=$('#view-portfolio');if(!v)return;focusLayout(v);retireStrays(v);}
function start(){enhance();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(enhance,50)}).observe(document.body,{childList:true,subtree:true});setInterval(enhance,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();