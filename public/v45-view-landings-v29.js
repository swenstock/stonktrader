(()=>{
'use strict';
if(window.__sbcViewLandingsV29)return;window.__sbcViewLandingsV29=true;
const NORMAL_TOP=new Set(['lobby','floor','tier','portfolio','exchange','leaders']);
function resetTop(){
  try{window.scrollTo({top:0,left:0,behavior:'instant'});}catch(_){window.scrollTo(0,0);}
  const active=document.querySelector('.view.active');
  if(active&&active.scrollTop)active.scrollTop=0;
  let p=active?.parentElement;
  while(p&&p!==document.body&&p!==document.documentElement){
    const s=getComputedStyle(p);
    if(/auto|scroll|overlay/.test(`${s.overflowY} ${s.overflow}`)&&p.scrollTop)p.scrollTop=0;
    p=p.parentElement;
  }
}
function settle(name){
  if(!NORMAL_TOP.has(name))return;
  resetTop();
  requestAnimationFrame(()=>resetTop());
  setTimeout(resetTop,80);
  setTimeout(resetTop,220);
  setTimeout(resetTop,500);
}
function install(){
  if(typeof window.showView!=='function'||window.showView.__viewLandingsV29)return;
  const original=window.showView;
  function wrapped(name){const out=original.apply(this,arguments);settle(String(name||''));return out;}
  wrapped.__viewLandingsV29=true;wrapped.__original=original;window.showView=wrapped;
}
function watchNav(){
  document.addEventListener('click',e=>{
    const el=e.target?.closest?.('button,a,[role="button"]');if(!el)return;
    const raw=`${el.getAttribute?.('onclick')||''} ${el.textContent||''}`;
    const m=raw.match(/showView\(['"](lobby|floor|tier|portfolio|exchange|leaders)['"]\)/i);
    const byText=!m&&/^\s*(LOBBY|LEADERBOARD|LEADERS|TICKET EXCHANGE|EXCHANGE)\s*$/i.test(el.textContent||'');
    const name=m?.[1]?.toLowerCase()||(byText?/leader/i.test(el.textContent)?'leaders':/exchange/i.test(el.textContent)?'exchange':'lobby':null);
    if(name)setTimeout(()=>settle(name),0);
  },true);
}
function start(){install();watchNav();setTimeout(install,300);setTimeout(install,1200);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();