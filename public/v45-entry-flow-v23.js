(()=>{
'use strict';
if(window.__sbcEntryFlowV23)return;window.__sbcEntryFlowV23=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function portfolioVisible(){const v=document.getElementById('view-portfolio');return !!(v&&visible(v));}
function tradeButton(){return $$('button,a,[role="button"]').find(el=>/^TRADE THIS ENTRY$/i.test(text(el)))||null;}
function tradeTarget(){return $$('button,a,[role="button"],[onclick]').find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(text(el))&&visible(el))||null;}
function rulesDialog(){
  const nodes=$$('[role="dialog"],.modal,.overlay,.popup,[class*="modal"],[class*="overlay"],[class*="popup"]');
  return nodes.filter(visible).find(el=>/\bRULES\b/i.test(text(el)))||null;
}
function affirmative(btn){return /CONTINUE|ACCEPT|AGREE|UNDERSTAND|GOT IT|ENTER|PROCEED|START|TRADE|^OK$|OKAY|LET'S GO|I'M READY/i.test(text(btn));}
function retryTrade(){
  const delays=[180,450,850,1350];
  delays.forEach(ms=>setTimeout(()=>{
    if(portfolioVisible())return;
    const t=tradeTarget();
    if(t){try{t.click();}catch(_){}}
  },ms));
}
function armRulesContinuation(){
  let done=false;
  const handler=e=>{
    if(done)return;
    const btn=e.target.closest?.('button,a,[role="button"]');
    if(!btn||!affirmative(btn))return;
    const dlg=rulesDialog();
    if(!dlg||!dlg.contains(btn))return;
    done=true;document.removeEventListener('click',handler,true);
    retryTrade();
  };
  document.addEventListener('click',handler,true);
  setTimeout(()=>{if(!done)document.removeEventListener('click',handler,true);},8000);
}
function installTradeButton(){
  const old=tradeButton();
  if(!old||old.dataset.entryFlowV23==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.entryFlowV23='1';
  fresh.dataset.entryTradeResetV22='1';fresh.dataset.entryTradeV20='1';fresh.dataset.entryTradeHandoffV21='1';
  fresh.removeAttribute('onclick');
  old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const t=tradeTarget();
    if(!t){alert('Could not open this entry for trading. Refresh the page and try again.');return;}
    armRulesContinuation();
    try{t.click();}catch(_){alert('Could not open this entry for trading. Refresh the page and try again.');}
  },true);
}
function nowViewingCard(){
  const label=$$('*').find(el=>el.children.length===0&&/^NOW VIEWING$/i.test(text(el))&&visible(el));
  if(!label)return null;
  let p=label.parentElement;
  while(p&&p!==document.body){
    const t=text(p).toUpperCase();
    if(t.includes('NOW VIEWING')&&(/ENTRY\s+\d+\s+OF\s+\d+/.test(t)||t.includes('TRADE THIS ENTRY')))return p;
    p=p.parentElement;
  }
  return label.parentElement;
}
function focusSelectedRoom(){
  const view=document.getElementById('view-my');
  if(!view||!visible(view))return;
  const card=nowViewingCard();
  if(!card)return;
  card.style.scrollMarginTop='92px';
  try{card.scrollIntoView({behavior:'auto',block:'start'});}catch(_){card.scrollIntoView();}
}
function scheduleRoomFocus(){[80,220,500,900].forEach(ms=>setTimeout(focusSelectedRoom,ms));}
function isMyContestsNav(el){return /^MY CONTESTS$/i.test(text(el))||/MY CONTESTS/i.test(el?.getAttribute?.('aria-label')||'');}
document.addEventListener('click',e=>{const nav=e.target.closest?.('button,a,[role="button"]');if(nav&&isMyContestsNav(nav))scheduleRoomFocus();},true);
let wasMy=false;
function watchMy(){const v=document.getElementById('view-my');const on=!!(v&&visible(v));if(on&&!wasMy)scheduleRoomFocus();wasMy=on;}
function run(){installTradeButton();watchMy();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
setInterval(watchMy,500);
setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();
