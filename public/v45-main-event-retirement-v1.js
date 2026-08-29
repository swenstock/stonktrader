(()=>{
'use strict';if(window.__sbcMainEventRetirementV1)return;window.__sbcMainEventRetirementV1=true;
const replacements=new Map([
['Main Event is the destination.','Collect Jr. Broker Badges. Get promoted.'],
['Earn or buy your way into the Main Event.','Play, trade, or upgrade tickets. Win Badges. Collect 20.'],
['MAIN EVENT TICKET — LIVE MARKET','TICKET EXCHANGE — LIVE MARKETS'],
['NEXT STONKBROKER MAIN EVENT','CORPORATE LADDER'],
['ACTUAL COMMITTED MAIN EVENT RESERVE','ACTUAL COMMITTED PRIZE RESERVE']
]);
function retireNode(el){if(!el||el.dataset?.sbcMainEventRetired==='1')return;const text=(el.textContent||'').trim();if(!/MAIN EVENT/i.test(text))return;for(const [from,to] of replacements){if(text===from){el.textContent=to;el.dataset.sbcMainEventRetired='1';return}}const actionable=el.matches?.('button,a,[role="button"],.inv.big-inv,.market-ticket-tab,.ticket-type-tab,article,.event');if(actionable||el.closest?.('#view-exchange,#view-leaders,#view-my')){el.style.display='none';el.dataset.sbcMainEventRetired='1';}}
const walk=()=>{document.querySelectorAll('button,a,[role="button"],.inv.big-inv,.market-ticket-tab,.ticket-type-tab,article,.event,h1,h2,h3,p,span,b,small,div').forEach(retireNode);};
const start=()=>{walk();new MutationObserver(walk).observe(document.documentElement,{childList:true,subtree:true});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
