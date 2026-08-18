(()=>{
'use strict';
if(window.__sbcEntryFlowV25)return;window.__sbcEntryFlowV25=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function tradeButton(){return $$('button,a,[role="button"]').find(el=>/^TRADE THIS ENTRY$/i.test(text(el)))||null;}
function tradeTarget(){return $$('button,a,[role="button"],[onclick]').find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(text(el))&&visible(el))||null;}
function rulesDialog(){return $$('[role="dialog"],.modal,.overlay,.popup,[class*="modal"],[class*="overlay"],[class*="popup"]').filter(visible).find(el=>/\bRULES\b/i.test(text(el)))||null;}
function affirmative(btn){return /CONTINUE|ACCEPT|AGREE|UNDERSTAND|GOT IT|ENTER|PROCEED|START|TRADE|^OK$|OKAY|LET'S GO|I'M READY/i.test(text(btn));}
function parseLiteral(raw){
  const s=String(raw||'').trim();
  if(/^['"].*['"]$/.test(s))return s.slice(1,-1);
  if(/^true$/i.test(s))return true;
  if(/^false$/i.test(s))return false;
  if(/^\d+$/.test(s))return Number(s);
  return s;
}
function contextFromTarget(target){
  if(!target)return null;
  const raw=target.getAttribute?.('onclick')||'';
  let m=raw.match(/openSelectedMCPortfolio\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^\)]+)\)/i);
  if(m)return {tab:parseLiteral(m[1]),id:parseLiteral(m[2]),isLive:parseLiteral(m[3])};
  const attrs=[target,...[...target.closest?.('[data-id],[data-contest-id],[data-tab]')?[target.closest('[data-id],[data-contest-id],[data-tab]')]:[]]];
  for(const el of attrs){
    if(!el)continue;
    const id=el.dataset?.contestId||el.dataset?.id;
    const tab=el.dataset?.tab;
    if(id&&tab)return {tab,id,isLive:String(tab).toLowerCase()==='live'};
  }
  return null;
}
function contextFromGlobals(){
  try{
    const view=document.getElementById('view-my');
    const hay=text(view||document.body).toUpperCase();
    const groups=[['live',window.MC_LIVE,true],['archive',window.MC_ARCHIVE,false]];
    let best=null;
    groups.forEach(([tab,list,isLive])=>{
      (Array.isArray(list)?list:[]).forEach(c=>{
        if(!c||!c.name||!hay.includes(String(c.name).toUpperCase()))return;
        const score=String(c.name).length;
        if(!best||score>best.score)best={tab,id:c.id,isLive,score};
      });
    });
    return best&&{tab:best.tab,id:best.id,isLive:best.isLive};
  }catch(_){return null;}
}
function selectedContext(){return contextFromTarget(tradeTarget())||contextFromGlobals();}
function directOpen(ctx){
  if(!ctx||typeof window.openSelectedMCPortfolio!=='function')return false;
  try{window.openSelectedMCPortfolio(ctx.tab,ctx.id,ctx.isLive);return true;}catch(_){return false;}
}
function installTrade(){
  const old=tradeButton();if(!old||old.dataset.entryFlowV25==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.entryFlowV25='1';fresh.dataset.entryFlowV23='1';fresh.dataset.entryTradeV24='1';fresh.dataset.entryTradeResetV22='1';fresh.dataset.entryTradeV20='1';fresh.dataset.entryTradeHandoffV21='1';
  fresh.removeAttribute('onclick');old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const target=tradeTarget(),ctx=selectedContext();
    if(!target&&!ctx){alert('Could not identify this contest entry. Refresh the page and try again.');return;}
    let handled=false;
    const onAck=ev=>{
      const btn=ev.target.closest?.('button,a,[role="button"]');
      if(!btn||!affirmative(btn))return;
      const dlg=rulesDialog();if(!dlg||!dlg.contains(btn))return;
      handled=true;document.removeEventListener('click',onAck,true);
      setTimeout(()=>{if(!directOpen(ctx)){const latest=selectedContext();if(!directOpen(latest))alert('Rules accepted, but SBC could not open this entry.');}},120);
    };
    document.addEventListener('click',onAck,true);
    setTimeout(()=>{if(!handled)document.removeEventListener('click',onAck,true);},8000);
    if(target){try{target.click();}catch(_){if(!directOpen(ctx))alert('Could not open this entry for trading.');}}
    else directOpen(ctx);
  },true);
}
function nowViewingCard(){
  const label=$$('*').find(el=>el.children.length===0&&/^NOW VIEWING$/i.test(text(el))&&visible(el));
  if(!label)return null;
  let p=label.parentElement;
  while(p&&p!==document.body){const t=text(p).toUpperCase();if(t.includes('NOW VIEWING')&&(/ENTRY\s+\d+\s+OF\s+\d+/.test(t)||t.includes('TRADE THIS ENTRY')))return p;p=p.parentElement;}
  return label.parentElement;
}
const POS_KEY='sbcMyContestBrokerTopV25';
function storedTop(){const n=Number(sessionStorage.getItem(POS_KEY));return Number.isFinite(n)&&n>40&&n<window.innerHeight-40?n:null;}
function alignMyContests(){
  const view=document.getElementById('view-my');if(!view||!visible(view))return;
  const card=nowViewingCard();if(!card)return;
  const target=storedTop();
  if(target!=null){
    const delta=card.getBoundingClientRect().top-target;
    if(Math.abs(delta)>2)window.scrollBy({top:delta,left:0,behavior:'auto'});
  }else{
    try{card.scrollIntoView({behavior:'auto',block:'nearest'});}catch(_){card.scrollIntoView(false);}
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
    if(before&&after&&before!==after){
      const top=card.getBoundingClientRect().top;
      if(top>40&&top<window.innerHeight-40)sessionStorage.setItem(POS_KEY,String(Math.round(top)));
    }
  },500);
},true);
function run(){installTrade();watchMy();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
setInterval(watchMy,500);setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();
