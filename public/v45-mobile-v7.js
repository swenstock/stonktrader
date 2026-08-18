(()=>{
'use strict';
if(!window.matchMedia('(max-width:620px)').matches||window.__sbcMobileV7)return;
window.__sbcMobileV7=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();

function nativeMyControl(){
  const all=$$('button,a,[onclick]');
  return all.find(el=>{
    if(el.closest('#mobileBottomNavV5'))return false;
    const t=clean(el.textContent).toUpperCase();
    const oc=String(el.getAttribute('onclick')||'').toUpperCase();
    return t==='MY CONTESTS'||/SHOWVIEW\(['\"]MY['\"]\)|VIEW-MY|MYCONTEST/.test(oc);
  })||null;
}
function myHasContent(){
  const view=$('#view-my');if(!view)return false;
  const list=$('#myContestList',view);
  if(list&&list.children.length)return true;
  return !!$('.mc-card,.selected-entry-banner,.mc-summary,.entry-rack-wrap',view);
}
function tryMyRenderFunctions(){
  const names=['renderMyContests','renderMyContestList','renderMC','renderMCList','loadMyContests','openMyContests'];
  for(const n of names){try{if(typeof window[n]==='function'){window[n]();if(myHasContent())return true;}}catch(_){}}
  return myHasContent();
}
function hydrateMyContests(){
  const view=$('#view-my');if(!view||myHasContent())return;
  const native=nativeMyControl();
  if(native){try{native.click();}catch(_){}}
  if(myHasContent())return;
  tryMyRenderFunctions();
  [60,180,420,900].forEach(ms=>setTimeout(()=>{if(!myHasContent()){tryMyRenderFunctions();const c=nativeMyControl();if(c){try{c.click();}catch(_){}}}},ms));
}
function wireMyNavigation(){
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-mobile-view-v5="my"]');
    if(!b)return;
    setTimeout(hydrateMyContests,0);setTimeout(hydrateMyContests,120);setTimeout(hydrateMyContests,420);
  },true);
  const view=$('#view-my');if(view&&getComputedStyle(view).display!=='none')hydrateMyContests();
}

const HOW_DETAILS=[
  [
    ['YOU START WITH','$100,000 in virtual cash. Every trader begins on equal footing.'],
    ['YOU CHOOSE','Pick a ticket tier and a live session that fits how you want to play.'],
    ['YOU TRADE','Build the strongest portfolio P&L before the contest clock expires.']
  ],
  [
    ['PICK YOUR FORMAT','Weekly, daily, morning, afternoon and Degen sessions give you different ways to qualify.'],
    ['STANDARD RULE','Regular contests keep new positions disciplined with a 10% initial position cap per stock.'],
    ['DEGEN HOURS','Degen opens the position cap so aggressive traders can concentrate when they want to.']
  ],
  [
    ['FINISH IN THE MONEY','Place high enough and you earn the ticket attached to that contest tier.'],
    ['YOUR TICKET, YOUR CALL','Use it to enter the next contest, hold it for later, or sell it on the Ticket Exchange.'],
    ['THE LADDER','Runner → Clerk → Trader → Jr. StonkBroker → Main Event. Keep climbing by performance.']
  ],
  [
    ['REACH THE MAIN EVENT','Win a qualifying ticket or buy one from another player on the exchange.'],
    ['FINAL OBJECTIVE','Trade the Main Event from the same $100,000 virtual starting account and finish #1.'],
    ['THE PRIZE','When the StonkBroker prize is locked, the winner takes the activated StonkBroker.']
  ]
];
function enrichHow(){
  const how=$('.how');if(!how||how.dataset.mobileV7How==='1')return;
  const steps=$$('.step',how);if(!steps.length)return;
  how.dataset.mobileV7How='1';
  steps.forEach((step,i)=>{
    step.classList.add('mobile-how-card-v7');
    if($('.mobile-how-detail-v7',step))return;
    const box=document.createElement('div');box.className='mobile-how-detail-v7';
    const rows=HOW_DETAILS[i]||HOW_DETAILS[HOW_DETAILS.length-1];
    box.innerHTML=rows.map(([k,v])=>`<div><small>${k}</small><p>${v}</p></div>`).join('')+`<footer><span>${i+1} OF ${steps.length}</span><b>${i<steps.length-1?'SWIPE →':'YOU MADE IT 🏆'}</b></footer>`;
    step.appendChild(box);
  });
}

function ensure(){hydrateMyContests();enrichHow();}
function start(){wireMyNavigation();ensure();let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(ensure,100)}).observe(document.body,{childList:true,subtree:true});setTimeout(ensure,300);setTimeout(ensure,1000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();