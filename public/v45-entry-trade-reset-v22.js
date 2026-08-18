(()=>{
'use strict';
if(window.__sbcEntryTradeResetV22)return;window.__sbcEntryTradeResetV22=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const text=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function findTradeButton(){return $$('button,a,[role="button"]').find(el=>/^TRADE THIS ENTRY$/i.test(text(el)))||null;}
function findTradeTarget(){
  const candidates=$$('button,a,[role="button"],[onclick]');
  return candidates.find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(text(el))&&visible(el))||null;
}
function findRulesDialog(){
  const candidates=$$('[role="dialog"],.modal,.overlay,.popup,section,div').filter(visible);
  return candidates.find(el=>/\bRULES\b/i.test(text(el))&&text(el).length<10000)||null;
}
function armRetry(target){
  let finished=false,seen=false;
  const stop=()=>{finished=true;observer.disconnect();clearTimeout(timeout);};
  const observer=new MutationObserver(()=>{
    if(finished)return;
    const dialog=findRulesDialog();
    if(!dialog)return;
    seen=true;
    $$('button,a,[role="button"]',dialog).forEach(btn=>{
      if(btn.dataset.entryRetryV22)return;
      btn.dataset.entryRetryV22='1';
      btn.addEventListener('click',()=>{
        setTimeout(()=>{
          if(finished)return;
          const still=findRulesDialog();
          if(!still){stop();try{target.click();}catch(_){}}
        },140);
      });
    });
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
  const timeout=setTimeout(()=>{if(!seen)stop();},2200);
}
function install(){
  const old=findTradeButton();
  if(!old||old.dataset.entryTradeResetV22==='1')return;
  const fresh=old.cloneNode(true);
  fresh.dataset.entryTradeResetV22='1';
  fresh.dataset.entryTradeV20='1';
  fresh.dataset.entryTradeHandoffV21='1';
  fresh.removeAttribute('onclick');
  old.replaceWith(fresh);
  fresh.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    const target=findTradeTarget();
    if(!target){alert('Could not open this entry for trading. Refresh the page and try again.');return;}
    armRetry(target);
    target.click();
  });
}
function run(){install();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,90);}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();
