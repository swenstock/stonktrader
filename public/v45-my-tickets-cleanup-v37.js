(()=>{
'use strict';
if(window.__sbcMyTicketsCleanupV37)return;window.__sbcMyTicketsCleanupV37=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function stripDescription(row){
  const left=$('.inv-left',row);if(!left)return;
  const label=$('b',left);if(!label)return;
  const cleanParent=el=>{if(!el)return;[...el.childNodes].forEach(node=>{
    if(node===label||node.contains?.(label))return;
    if(node.nodeType===Node.TEXT_NODE){if(node.textContent.trim())node.remove();return;}
    if(node.nodeType===Node.ELEMENT_NODE&&/WON IN|TRANSFERABLE|AVAILABLE TO PLAY|OR SELL/i.test(node.textContent||''))node.remove();
  });};
  cleanParent(label.parentElement);
  cleanParent(left);
  const p=label.parentElement;
  if(p&&p!==left){[...p.childNodes].forEach(node=>{if(node!==label)node.remove();});}
}
function ensureSettlement(){
  if(!document.querySelector('link[data-sbc-ticket-settlement-v38]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-ticket-settlement-v38.css?v=38';l.dataset.sbcTicketSettlementV38='1';document.head.appendChild(l);}
  if(!window.__sbcTicketSettlementV38&&!document.querySelector('script[data-sbc-ticket-settlement-v38]')){const s=document.createElement('script');s.src='/v45-ticket-settlement-v38.js?v=38';s.dataset.sbcTicketSettlementV38='1';document.head.appendChild(s);}
}
function clean(){
  const v=$('#view-exchange');if(!v)return;
  const h=$$('h1,h2,h3',v).find(x=>(x.textContent||'').trim().toUpperCase()==='MY TICKETS');
  const box=h?.parentElement;if(!box)return;
  $$('.inv.big-inv',box).forEach(stripDescription);
}
function run(){ensureSettlement();clean();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(run,60)}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();