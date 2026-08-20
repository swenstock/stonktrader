(()=>{
'use strict';
if(window.__sbcQueueConfirmRescueV1)return;window.__sbcQueueConfirmRescueV1=true;
const text=x=>String(x?.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
function queueDialogFrom(el){
  let n=el;
  while(n&&n!==document.body){const t=text(n);if(t.includes('ORDER QUEUED')&&(n.matches?.('[role="dialog"],.modal,.overlay,[class*="modal"],[class*="overlay"],section,div')))return n;n=n.parentElement;}
  return null;
}
function closeNode(node){
  if(!node)return;
  const wrapper=node.matches?.('[role="dialog"]')?node.parentElement:node;
  const candidate=(wrapper&&text(wrapper).includes('ORDER QUEUED'))?wrapper:node;
  const x=candidate.querySelector?.('button[aria-label="Close"],.close,.modal-close,[class*="close"]');
  if(x){try{x.click();return;}catch(_){}}
  if(candidate!==document.body)candidate.remove();
}
function goOrders(){
  try{if(typeof window.showView==='function')window.showView('portfolio');}catch(_){ }
  setTimeout(()=>{const q=document.getElementById('queuedOrders')||document.querySelector('.queue-card,.orders-activity-card,.orders-activity-v45');if(q){q.scrollIntoView({behavior:'smooth',block:'center'});q.classList.add('sbc-queue-focus-v1');setTimeout(()=>q.classList.remove('sbc-queue-focus-v1'),1400);}},40);
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('button');if(!b)return;const t=text(b);if(t!=='VIEW MY ORDERS'&&t!=='KEEP TRADING')return;
  const d=queueDialogFrom(b);if(!d)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();closeNode(d);if(t==='VIEW MY ORDERS')goOrders();
},true);
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const candidates=[...document.querySelectorAll('[role="dialog"],.modal,.overlay,[class*="modal"],[class*="overlay"]')].filter(x=>text(x).includes('ORDER QUEUED'));
  if(candidates.length){e.preventDefault();closeNode(candidates[candidates.length-1]);}
});
})();