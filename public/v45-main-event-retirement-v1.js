(()=>{
'use strict';if(window.__sbcMainEventRetirementV1)return;window.__sbcMainEventRetirementV1=true;
const PHRASES=[
[/NEXT STONKBROKER MAIN EVENT(?:\s*[—-]\s*\d+% FUNDED)?/gi,'STONKBROKER PROMOTION RESERVE'],
[/MAIN EVENT TICKET\s*[—-]\s*LIVE MARKET/gi,'TICKET EXCHANGE — LIVE MARKETS'],
[/THE MAIN EVENT IS THE DESTINATION\./gi,'THE CORPORATE LADDER IS THE PATH.'],
[/Earn or buy your way into the Main Event\./gi,'Play, trade, or upgrade tickets. Win Badges. Collect 20.'],
[/Win a Main Event ticket through competition\./gi,'Earn Jr. Broker Badges through performance.'],
[/One Main Event\. One champion\. One unforgettable prize\./gi,'Collect 20 Jr. Broker Badges. Get promoted.'],
[/Highest qualifying tier before the Main Event\./gi,'Highest contest tier in the corporate ladder.'],
[/Highest finishers can earn scarce Main Event tickets; other top finishers can earn transferable lower-tier entries\./gi,'Highest finishers can earn Jr. Broker Badges; other top finishers can earn transferable lower-tier entries.'],
[/When funding reaches 100%, the StonkBroker and activation allocation are secured and the Main Event countdown begins\./gi,'When funding reaches 100%, the StonkBroker and activation allocation are secured for the Badge promotion path.'],
[/Enter with a ticket you won or bought from another player\. One week\. One leaderboard\. One champion\./gi,'Collect 20 Jr. Broker Badges through performance and get promoted to an Activated StonkBroker.'],
[/Earn your ticket\s*[—-]\s*or buy it on the exchange\./gi,'Earn Badges. Trade transferable entries in STONK.'],
[/Main Event/gi,'Corporate Ladder']
];
function replaceText(root=document){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){let t=n.nodeValue||'';if(!/MAIN EVENT/i.test(t))continue;for(const [re,to] of PHRASES)t=t.replace(re,to);n.nodeValue=t;}}
function retireExchange(){const v=document.getElementById('view-exchange');if(!v)return;v.querySelectorAll('button,a,[role="button"],.inv.big-inv,.market-ticket-tab,.ticket-type-tab,.ticket-filter-btn').forEach(el=>{if(/MAIN EVENT/i.test(el.textContent||'')||/Main Event/.test(el.getAttribute?.('onclick')||''))el.remove();});const title=document.getElementById('marketTicketTitle');if(title&&/MAIN EVENT/i.test(title.textContent||''))title.textContent='RUNNER TICKET MARKET';try{if(typeof activeTicketMarket!=='undefined'&&/MAIN EVENT/i.test(String(activeTicketMarket))){activeTicketMarket='Runner';ownedTicketContext={name:'Runner',ticketId:null};const runner=[...document.querySelectorAll('#ticketTypeSelector button')].find(b=>/RUNNER/i.test(b.textContent||''));document.querySelectorAll('#ticketTypeSelector button').forEach(b=>b.classList.remove('active'));runner?.classList.add('active');window.renderTicketMarket?.();}}catch(_){}['sellChoiceModal','ticketOrderModal','bidOrderModal'].forEach(id=>{const m=document.getElementById(id);if(m&&/MAIN EVENT/i.test(m.textContent||''))m.classList.remove('open');});}
function walk(){replaceText();retireExchange();}
const start=()=>{walk();new MutationObserver(()=>walk()).observe(document.documentElement,{childList:true,subtree:true,characterData:true});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
