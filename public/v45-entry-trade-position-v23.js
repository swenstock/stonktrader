(()=>{
'use strict';
if(window.__sbcEntryTradePositionV23)return;window.__sbcEntryTradePositionV23=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function tradeButton(){return $$('button,a,[role="button"]').find(el=>/^TRADE THIS ENTRY$/i.test(text(el)))||null;}
function tradeTarget(){return $$('button,a,[role="button"],[onclick]').find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(text(el))&&visible(el))||null;}
function rulesDialog(){
  const nodes=$$('[role="dialog"],.modal,.overlay,.popup,section,div').filter(visible);
  return nodes.find(el=>/\bRULES\b/i.test(text(el))&&text(el).length<10000)||null;
}
function isDismissOnly(btn){const t=text(btn).toUpperCase();return /^(X|CLOSE|CANCEL|BACK|NOT NOW|NO)$/.test(t);}
function waitForRulesAndContinue(){
  let seen=false,done=false;
  const started=Date.now();
  const tick=setInterval(()=>{
    if(done){clearInterval(tick);return;}
    const d=rulesDialog();
    if(d&&!seen){
      seen=true;
      $$('button,a,[role="button"]',d).forEach(b=>{
        if(b.dataset.entryV23Ack)return;b.dataset.entryV23Ack='1';
        b.addEventListener('click',()=>{
          if(isDismissOnly(b)){done=true;return;}
          const poll=setInterval(()=>{
            if(rulesDialog())return;
            clearInterval(poll);
            if(done)return;
            done=true;
            setTimeout(()=>{
              const fresh=tradeTarget();
              if(fresh)fresh.click();
              else alert('The rules were accepted, but SBC could not reopen this entry. Refresh the page and try again.');
            },220);
          },80);
          setTimeout(()=>clearInterval(poll),2500);
        },{once:true});
      });
    }
    if(!seen&&Date.now()-started>2200){done=true;clearInterval(tick);}
    if(Date.now()-started>5000){done=true;clearInterval(tick);}
  },80);
}
function installTrade(){
  const old=tradeButton();if(!old||old.dataset.entryTradeV23==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.entryTradeV23='1';fresh.dataset.entryTradeResetV22='1';fresh.dataset.entryTradeV20='1';fresh.dataset.entryTradeHandoffV21='1';
  fresh.removeAttribute('onclick');old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    const target=tradeTarget();
    if(!target){alert('Could not open this entry for trading. Refresh the page and try again.');return;}
    waitForRulesAndContinue();
    target.click();
  });
}
function myView(){return document.querySelector('#view-my,[data-view="my"],.view-my');}
function resetMyContestPosition(){
  const view=myView();
  if(view&&typeof view.scrollTo==='function')try{view.scrollTo({top:0,left:0,behavior:'instant'});}catch(_){view.scrollTop=0;}
  try{window.scrollTo({top:0,left:0,behavior:'instant'});}catch(_){window.scrollTo(0,0);}
}
function installMyContestNav(){
  if(document.documentElement.dataset.myContestPositionV23==='1')return;
  document.documentElement.dataset.myContestPositionV23='1';
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a,[role="button"]');if(!el)return;
    if(!/^MY CONTESTS$/i.test(text(el)))return;
    setTimeout(resetMyContestPosition,40);
    setTimeout(resetMyContestPosition,180);
    setTimeout(resetMyContestPosition,500);
  },true);
}
function run(){installTrade();installMyContestNav();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,90);}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();
