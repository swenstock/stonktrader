(()=>{
'use strict';
if(window.__sbcEntryFlowV26)return;window.__sbcEntryFlowV26=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function tradeButton(){return $$('button,a,[role="button"]').find(el=>/^TRADE THIS ENTRY$/i.test(text(el)))||null;}
function tradeTarget(){return $$('button,a,[role="button"],[onclick]').find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(text(el))&&visible(el))||null;}
function openTrustedCurrentEntry(){
  try{return typeof window.__sbcOpenCurrentMyContestEntry==='function'&&window.__sbcOpenCurrentMyContestEntry()===true;}catch(_){return false;}
}
function armNextRulesInteraction(){
  let done=false;
  const started=Date.now();
  const handler=e=>{
    if(done||Date.now()-started<120)return;
    const currentTrade=tradeButton();
    if(currentTrade&&(e.target===currentTrade||currentTrade.contains?.(e.target)))return;
    done=true;
    document.removeEventListener('click',handler,true);
    setTimeout(()=>{
      if(!openTrustedCurrentEntry())alert('SBC could not identify the selected contest entry. Please click another broker, then return to this entry and try again.');
    },120);
  };
  document.addEventListener('click',handler,true);
  setTimeout(()=>{if(!done)document.removeEventListener('click',handler,true);},10000);
}
function installTrade(){
  const old=tradeButton();if(!old||old.dataset.entryFlowV26==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.entryFlowV26='1';fresh.dataset.entryFlowV25='1';fresh.dataset.entryFlowV23='1';fresh.dataset.entryTradeV24='1';fresh.dataset.entryTradeResetV22='1';fresh.dataset.entryTradeV20='1';fresh.dataset.entryTradeHandoffV21='1';
  fresh.removeAttribute('onclick');old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const target=tradeTarget();
    if(!target){
      if(!openTrustedCurrentEntry())alert('Could not open this entry for trading. Refresh the page and try again.');
      return;
    }
    armNextRulesInteraction();
    try{target.click();}catch(_){if(!openTrustedCurrentEntry())alert('Could not open this entry for trading. Refresh the page and try again.');}
  },true);
}
function nowViewingCard(){
  const label=$$('*').find(el=>el.children.length===0&&/^NOW VIEWING$/i.test(text(el))&&visible(el));
  if(!label)return null;
  let p=label.parentElement;
  while(p&&p!==document.body){const t=text(p).toUpperCase();if(t.includes('NOW VIEWING')&&(/ENTRY\s+\d+\s+OF\s+\d+/.test(t)||t.includes('TRADE THIS ENTRY')))return p;p=p.parentElement;}
  return label.parentElement;
}
const POS_KEY='sbcMyContestBrokerTop';
const OLD_POS_KEY='sbcMyContestBrokerTopV25';
function storedTop(){
  let n=Number(localStorage.getItem(POS_KEY));
  if(!(Number.isFinite(n)&&n>40&&n<window.innerHeight-40)){
    n=Number(sessionStorage.getItem(OLD_POS_KEY));
    if(Number.isFinite(n)&&n>40&&n<window.innerHeight-40)localStorage.setItem(POS_KEY,String(Math.round(n)));
  }
  return Number.isFinite(n)&&n>40&&n<window.innerHeight-40?n:null;
}
function saveTop(top){if(Number.isFinite(top)&&top>40&&top<window.innerHeight-40)localStorage.setItem(POS_KEY,String(Math.round(top)));}
function alignMyContests(){
  const view=document.getElementById('view-my');if(!view||!visible(view))return;
  const card=nowViewingCard();if(!card)return;
  const target=storedTop();
  if(target!=null){
    const delta=card.getBoundingClientRect().top-target;
    if(Math.abs(delta)>2)window.scrollBy({top:delta,left:0,behavior:'auto'});
  }
}
function scheduleAlign(){[120,300,600,1000].forEach(ms=>setTimeout(alignMyContests,ms));}
let wasMy=false;
function watchMy(){const v=document.getElementById('view-my');const on=!!(v&&visible(v));if(on&&!wasMy)scheduleAlign();wasMy=on;}
document.addEventListener('click',e=>{
  const view=document.getElementById('view-my');if(!view||!visible(view)||!view.contains(e.target))return;
  const before=text(nowViewingCard());
  setTimeout(()=>{
    const card=nowViewingCard();if(!card)return;
    const after=text(card);
    if(before&&after&&before!==after)saveTop(card.getBoundingClientRect().top);
  },500);
},true);
function run(){installTrade();watchMy();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
setInterval(watchMy,500);setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();
