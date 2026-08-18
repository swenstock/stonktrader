(()=>{
'use strict';
if(window.__sbcMyTicketsCleanupV37)return;window.__sbcMyTicketsCleanupV37=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function stripDescription(row){
  const left=$('.inv-left',row);if(!left)return;
  const label=$('b',left);if(!label)return;
  // Remove raw descriptive text nodes wherever they sit beside the bold ticket label.
  const cleanParent=el=>{if(!el)return;[...el.childNodes].forEach(node=>{
    if(node===label||node.contains?.(label))return;
    if(node.nodeType===Node.TEXT_NODE){if(node.textContent.trim())node.remove();return;}
    if(node.nodeType===Node.ELEMENT_NODE&&/WON IN|TRANSFERABLE|AVAILABLE TO PLAY|OR SELL/i.test(node.textContent||''))node.remove();
  });};
  cleanParent(label.parentElement);
  cleanParent(left);
  // If native markup put the description after <b> inside the same wrapper, keep only the bold label there.
  const p=label.parentElement;
  if(p&&p!==left){[...p.childNodes].forEach(node=>{if(node!==label)node.remove();});}
}
function clean(){
  const v=$('#view-exchange');if(!v)return;
  const h=$$('h1,h2,h3',v).find(x=>(x.textContent||'').trim().toUpperCase()==='MY TICKETS');
  const box=h?.parentElement;if(!box)return;
  $$('.inv.big-inv',box).forEach(stripDescription);
}
function run(){clean();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(run,60)}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();