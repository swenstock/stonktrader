(()=>{
'use strict';
if(window.__sbcEntryActionsV20)return;window.__sbcEntryActionsV20=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const txt=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function control(label){
  const needle=label.toUpperCase();
  return $$('button,a,[role="button"]').find(el=>txt(el).toUpperCase()===needle)||null;
}
function firstTradeLink(){
  const exact=$$('button,a,[role="button"],div').find(el=>/OPEN CHART\s*\+\s*TRADE/i.test(txt(el)) && (el.onclick||el.getAttribute?.('onclick')||el.tagName==='BUTTON'||el.tagName==='A'));
  if(exact)return exact;
  const positions=$$('section,div').find(el=>/CURRENT POSITIONS/i.test(txt(el)) && /OPEN CHART\s*\+\s*TRADE/i.test(txt(el)));
  return positions?.querySelector('button,a,[role="button"],[onclick]')||null;
}
function fixTradeButton(){
  const btn=control('TRADE THIS ENTRY');
  if(!btn||btn.dataset.entryTradeV20==='1')return;
  btn.dataset.entryTradeV20='1';
  btn.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    const target=firstTradeLink();
    if(target&&target!==btn){target.click();return;}
    // Fallback for an entry with no positions: use the original inline handler if one exists.
    const raw=btn.dataset.originalOnclickV20||'';
    if(raw){try{Function(raw).call(btn);return;}catch(_){}}
    alert('This entry does not have a position to open yet. Add or select a stock from the entry to begin trading.');
  },true);
  const original=btn.getAttribute('onclick');
  if(original){btn.dataset.originalOnclickV20=original;btn.removeAttribute('onclick');}
}
function actionRow(){
  const trade=control('TRADE THIS ENTRY');
  if(!trade)return null;
  let p=trade.parentElement;
  while(p&&p!==document.body){
    const t=txt(p).toUpperCase();
    if(t.includes('TRADE THIS ENTRY')&&t.includes('FIND ME')&&t.includes('LEADERBOARD'))return p;
    p=p.parentElement;
  }
  return trade.parentElement;
}
function nowViewingCard(){
  const labels=$$('*').filter(el=>el.children.length===0&&/^NOW VIEWING$/i.test(txt(el)));
  for(const label of labels){
    let p=label.parentElement;
    while(p&&p!==document.body){
      const t=txt(p).toUpperCase();
      if(t.includes('NOW VIEWING')&&/ENTRY\s+\d+\s+OF\s+\d+/.test(t))return p;
      p=p.parentElement;
    }
  }
  return null;
}
function moveActions(){
  const row=actionRow(),view=nowViewingCard();
  if(!row||!view||row===view||view.contains(row))return;
  row.classList.add('entry-action-dock-v20');
  view.insertAdjacentElement('afterend',row);
}
function compactAnalyze(){
  const row=actionRow();if(!row)return;
  const analyze=$$('button,a,[role="button"]',row).find(el=>/ANALYZE THIS CONTEST/i.test(txt(el)));
  if(analyze)analyze.classList.add('entry-analyze-v20');
}
function run(){fixTradeButton();moveActions();compactAnalyze();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer=null;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,100);}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,300);setTimeout(run,900);setTimeout(run,1800);
})();
