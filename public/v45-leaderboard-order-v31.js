(()=>{
'use strict';
if(window.__sbcLeaderboardOrderV31)return;window.__sbcLeaderboardOrderV31=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
function cleanTierLabels(cards){
  cards.forEach(card=>{
    $$('*',card).forEach(el=>{
      if(el.children.length)return;
      if((el.textContent||'').trim().toUpperCase()==='VIEW LEADERS')el.style.display='none';
    });
  });
}
function reorder(){
  const view=$('#view-leaders');if(!view)return;
  const live=$('.live-section',view);if(!live)return;
  const tierButtons=$$('[onclick*="openLeaderTier"]',view);if(!tierButtons.length)return;
  const tierCards=tierButtons.map(b=>b.closest('article')||b.closest('[class*="tier"]')).filter(Boolean);
  if(!tierCards.length)return;
  cleanTierLabels(tierCards);
  const tierGrid=tierCards[0].parentElement;if(!tierGrid)return;
  const parent=tierGrid.parentElement;
  if(!parent)return;
  if(live.parentElement===parent&&live.nextElementSibling!==tierGrid){parent.insertBefore(live,tierGrid);}
}
function start(){reorder();setTimeout(reorder,200);setTimeout(reorder,700);setTimeout(reorder,1500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
new MutationObserver(()=>{clearTimeout(start.t);start.t=setTimeout(reorder,80)}).observe(document.documentElement,{childList:true,subtree:true});
})();