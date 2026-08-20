(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcDesktopStage52V56)return;window.__sbcDesktopStage52V56=true;
const $=(s,r=document)=>r.querySelector(s);
function focusLayout(v){
  v.classList.add('stage52-desktop-focus-v56');
  const workspace=$('.trading-workspace-v47',v)||$('.stage43-workspace-v48',v);
  if(workspace)workspace.classList.add('stage52-primary-workspace-v56');
  const metrics=$('.stage51-header-metrics-v55',v)||$('.contest-metrics-strip-v46',v);
  if(metrics)metrics.classList.add('stage52-focus-anchor-v56');
}
function enhance(){const v=$('#view-portfolio');if(!v)return;focusLayout(v);}
function start(){enhance();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();