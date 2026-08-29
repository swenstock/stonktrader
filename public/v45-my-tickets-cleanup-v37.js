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
function normalizeExchangePost(e){
  const b=e.target.closest?.('button');if(!b)return;
  const root=b.closest?.('#ticketOrderModal');if(!root)return;
  const text=(b.textContent||'').trim().toUpperCase();
  if(!/(POST|LIST|PLACE\s+ASK|CONFIRM\s+OFFER|CREATE\s+OFFER)/.test(text)||/SELL\s+TO\s+BID|BUY\s+OFFER/.test(text))return;
  const title=$('#ticketOrderTitle',root);if(!title)return;
  const old=title.textContent||'';
  if(!/^SELL\b/i.test(old))return;
  title.textContent=`LIST ${old.replace(/^SELL\s+/i,'')}`;
  queueMicrotask(()=>{if(title.isConnected)title.textContent=old;});
}
function updateBasketPreview(){
  const ranges=$$('[data-bb19-range]');if(!ranges.length)return;
  let sum=0;
  ranges.forEach(r=>{const v=Number(r.value||0);sum+=v;const row=r.closest('.bb19-ticket-row');const pct=row?.querySelector('strong');if(pct){pct.textContent=`${v.toFixed(2)}%`;pct.style.color='#66d9ff';pct.style.minWidth='64px';}const symbol=r.dataset.bb19Range;const stock=$(`[data-bb19-pick="${CSS.escape(symbol)}"]`);const leftPct=stock?.querySelector('em');if(leftPct)leftPct.textContent=`${v.toFixed(1)}%`;});
  const pane=$$('.bb19-pane')[1],aside=pane?.querySelector('.bb19-pane-head aside');
  const total=aside?.querySelector('strong'),small=aside?.querySelector('small');
  if(total)total.textContent=`${sum.toFixed(1)}%`;
  if(small)small.textContent=sum>100?`${(sum-100).toFixed(1)}% OVER`:`${Math.max(0,100-sum).toFixed(1)}% CASH`;
}
function wireBasketLive(){
  $$('[data-bb19-range]').forEach(r=>{if(r.dataset.bb39Live)return;r.dataset.bb39Live='1';const commit=r.oninput;r.oninput=()=>updateBasketPreview();r.onchange=e=>{if(typeof commit==='function')commit.call(r,e);};});
  updateBasketPreview();
}
function ensureSettlement(){
  if(!window.__sbcTicketNativeHooksV41&&!document.querySelector('script[data-sbc-ticket-native-v41]')){const s=document.createElement('script');s.src='/v45-ticket-native-hooks-v41.js?v=43';s.dataset.sbcTicketNativeV41='1';document.head.appendChild(s);}
  if(!document.querySelector('link[data-sbc-ticket-settlement-v38]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-ticket-settlement-v38.css?v=38';l.dataset.sbcTicketSettlementV38='1';document.head.appendChild(l);}
  if(!window.__sbcTicketSettlementV38&&!document.querySelector('script[data-sbc-ticket-settlement-v38]')){const s=document.createElement('script');s.src='/v45-ticket-settlement-v38.js?v=39';s.dataset.sbcTicketSettlementV38='1';document.head.appendChild(s);}
  if(!window.__sbcTicketRecentV40&&!document.querySelector('script[data-sbc-ticket-recent-v40]')){const s=document.createElement('script');s.src='/v45-ticket-recent-v40.js?v=40';s.dataset.sbcTicketRecentV40='1';document.head.appendChild(s);}
  if(!document.querySelector('link[data-sbc-trader-confirm-v42]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-trader-action-confirm-v42.css?v=42';l.dataset.sbcTraderConfirmV42='1';document.head.appendChild(l);}
  if(!window.__sbcTraderActionConfirmV42&&!document.querySelector('script[data-sbc-trader-confirm-v42]')){const s=document.createElement('script');s.src='/v45-trader-action-confirm-v42.js?v=42';s.dataset.sbcTraderConfirmV42='1';document.head.appendChild(s);}
}
function clean(){
  const v=$('#view-exchange');if(v){const h=$$('h1,h2,h3',v).find(x=>(x.textContent||'').trim().toUpperCase()==='MY TICKETS');const box=h?.parentElement;if(box)$$('.inv.big-inv',box).forEach(stripDescription);}
  wireBasketLive();
}
window.addEventListener('click',normalizeExchangePost,true);
function run(){ensureSettlement();clean();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
let t;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(run,60)}).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);
})();