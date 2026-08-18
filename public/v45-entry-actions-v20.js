(()=>{
'use strict';
if(window.__sbcEntryActionsV20)return;window.__sbcEntryActionsV20=true;
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const txt=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
function control(label){
  const needle=label.toUpperCase();
  return $$('button,a,[role="button"]').find(el=>txt(el).toUpperCase()===needle)||null;
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
function run(){moveActions();compactAnalyze();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let timer=null;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,100);}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,300);setTimeout(run,900);setTimeout(run,1800);
})();
