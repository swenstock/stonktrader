(()=>{
'use strict';
if(window.__sbcBrowserHistoryV1)return;window.__sbcBrowserHistoryV1=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const routes=new Map();
let suppress=false,seq=0;
const visibleView=()=>$$('[id^="view-"]').find(v=>{
  if(v.hidden||v.getAttribute('aria-hidden')==='true')return false;
  const s=getComputedStyle(v);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';
})||null;
const viewKey=v=>v&&v.id&&v.id.startsWith('view-')?v.id.slice(5):null;
const clickable=el=>el&&el.closest&&el.closest('button,a,[role="button"],[tabindex]');
function remember(key,el){
  if(!key||!el)return;
  if(!el.dataset.sbcHistoryKey)el.dataset.sbcHistoryKey='h'+Math.random().toString(36).slice(2,10);
  routes.set(key,{ref:el,id:el.dataset.sbcHistoryKey});
}
function activeNav(){
  return $$('button,a,[role="button"]').find(el=>{
    if(el.closest('[id^="view-"]'))return false;
    if(el.getAttribute('aria-current')==='page')return true;
    return el.classList.contains('active')||el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true';
  })||null;
}
function routeEl(key){
  const r=routes.get(key);if(!r)return null;
  if(r.ref&&r.ref.isConnected)return r.ref;
  return document.querySelector(`[data-sbc-history-key="${CSS.escape(r.id)}"]`);
}
function seed(){
  const key=viewKey(visibleView());
  if(!key)return;
  remember(key,activeNav());
  if(!history.state||!history.state.sbcView)history.replaceState({...history.state,sbcView:key,sbcSeq:seq},'',location.href);
}
document.addEventListener('click',e=>{
  if(suppress)return;
  const trigger=clickable(e.target);if(!trigger)return;
  const before=viewKey(visibleView());
  if(before)remember(before,activeNav());
  setTimeout(()=>{
    const after=viewKey(visibleView());
    if(!after||after===before)return;
    remember(after,trigger);
    seq+=1;
    history.pushState({...history.state,sbcView:after,sbcSeq:seq},'',location.href);
  },80);
},true);
window.addEventListener('popstate',e=>{
  const target=e.state&&e.state.sbcView;if(!target)return;
  const current=viewKey(visibleView());if(!current||current===target)return;
  const el=routeEl(target);if(!el)return;
  suppress=true;
  try{el.click();}finally{setTimeout(()=>{suppress=false},120);}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',seed,{once:true});else seed();
})();
