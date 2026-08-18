(()=>{
'use strict';
if(window.__sbcEntryTradeHandoffV21)return;window.__sbcEntryTradeHandoffV21=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
let pendingTarget=null,arming=false;

function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function tradeButton(){return $$('button,a,[role="button"]').find(el=>/^TRADE THIS ENTRY$/i.test(text(el)))||null;}
function tradeTarget(){
  return $$('button,a,[role="button"],[onclick]').find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(text(el))&&visible(el))||null;
}
function ruleDialog(){
  const candidates=$$('[role="dialog"],.modal,.overlay,.popup,section,div').filter(visible);
  return candidates.find(el=>/\bRULES\b/i.test(text(el))&&text(el).length<8000)||null;
}
function affirmative(dialog){
  const buttons=$$('button,a,[role="button"]',dialog).filter(visible);
  return buttons.find(b=>/START|CONTINUE|ACCEPT|AGREE|UNDERSTAND|GOT IT|ENTER|PROCEED|TRADE|OKAY|^OK$/i.test(text(b)))||null;
}
function armContinuation(target){
  pendingTarget=target;
  if(arming)return;
  arming=true;
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const dialog=ruleDialog();
    const yes=dialog&&affirmative(dialog);
    if(yes&&!yes.dataset.entryContinueV21){
      yes.dataset.entryContinueV21='1';
      yes.addEventListener('click',()=>{
        const t=pendingTarget;pendingTarget=null;
        setTimeout(()=>{try{t?.click();}catch(_){}},80);
      },{once:true});
      clearInterval(timer);arming=false;
      return;
    }
    // No rules dialog means the original click may already have navigated successfully.
    if(tries>20){clearInterval(timer);arming=false;pendingTarget=null;}
  },100);
}
function bind(){
  const btn=tradeButton();if(!btn||btn.dataset.entryTradeHandoffV21)return;
  btn.dataset.entryTradeHandoffV21='1';
  btn.addEventListener('click',()=>{
    const target=tradeTarget();
    if(target)armContinuation(target);
  },true);
}
function run(){bind();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80);}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,300);setTimeout(run,1000);
})();
