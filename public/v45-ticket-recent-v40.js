(()=>{
'use strict';
if(window.__sbcTicketRecentV40)return;window.__sbcTicketRecentV40=true;
const STORE='sbcTicketSettlementV38';
const LABELS={junior:'JR. STONKBROKER',trader:'TRADER',clerk:'CLERK',runner:'RUNNER'};
const $=(s,r=document)=>r.querySelector(s);
function loadTrades(){try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');return Array.isArray(x.trades)?x.trades:[]}catch(_){return[]}}
function ensureBox(){
  const mine=$('#tm36Mine');if(!mine||!mine.parentNode)return null;
  const legacy=$('#tm38Recent',mine);if(legacy)legacy.remove();
  let box=$('#tm40Recent');
  if(!box){box=document.createElement('section');box.id='tm40Recent';box.className='tm38-recent tm40-recent-persistent';mine.parentNode.insertBefore(box,mine.nextSibling);}
  else if(box.previousElementSibling!==mine)mine.parentNode.insertBefore(box,mine.nextSibling);
  return box;
}
function render(){
  const box=ensureBox();if(!box)return;
  const trades=loadTrades().slice(0,6);
  box.innerHTML=`<div class="tm38-recent-head"><b>RECENT TRADES</b><span>PERSISTED FILLS</span></div>${trades.length?trades.map(t=>`<div class="tm38-trade"><span class="${t.side==='BUY'?'buy':'sell'}">${t.side}</span><b>${LABELS[t.type]||t.type}</b><strong>${Number(t.price||0).toLocaleString()} STONK</strong><time>${new Date(t.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</time></div>`).join(''):'<div class="tm38-empty">No completed ticket trades yet.</div>'}`;
}
let timer=null;
function schedule(){clearTimeout(timer);timer=setTimeout(render,130)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('storage',e=>{if(e.key===STORE)render()});
setTimeout(render,400);setTimeout(render,1200);setInterval(render,1500);
})();