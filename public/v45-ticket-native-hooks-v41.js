(()=>{
'use strict';
if(window.__sbcTicketNativeHooksV41)return;window.__sbcTicketNativeHooksV41=true;
function bidTerms(){let best=0,ask=Infinity;try{best=Number(bidOrder?.bestBid||0);ask=Number(bidOrder?.ask||Infinity)}catch(_){}return{best,ask};}
function install(){
  if(typeof window.updateBidOrderSummary==='function'&&!window.updateBidOrderSummary.__sbcV42){const original=window.updateBidOrderSummary;const wrapped=function(){const terms=bidTerms();let changed=false;try{if(typeof bidOrder!=='undefined'){bidOrder.bestBid=0;changed=true}}catch(_){}let result;try{result=original.apply(this,arguments)}finally{if(changed){try{bidOrder.bestBid=terms.best}catch(_){}}}const price=Math.round(Number(document.getElementById('bidOrderPrice')?.value||0));const valid=price>=1&&price<terms.ask;const btn=document.querySelector('#bidOrderModal .confirm');if(btn){btn.disabled=!valid;btn.style.opacity=valid?'1':'.45';}const box=document.getElementById('bidOrderSummary');const note=box?.lastElementChild;if(note){if(price<1)note.textContent='Enter a bid of at least 1 STONK.';else if(price>=terms.ask)note.textContent=`That reaches the ${terms.ask.toLocaleString()} STONK lowest Ask. Buy the Ask instead for an immediate fill.`;else if(price<=terms.best)note.textContent=`Your ${price.toLocaleString()} STONK Bid will rest below the current ${terms.best.toLocaleString()} STONK highest Bid.`;else note.textContent='Your Bid becomes the highest posted offer if the market has not changed.';}return result;};wrapped.__sbcV42=true;window.updateBidOrderSummary=wrapped;}
}
function seedExchangeAuth(){try{const token=localStorage.getItem('token');if(!token)return;window.fetch('/api/tickets',{headers:{Authorization:`Bearer ${token.replace(/^Bearer\s+/i,'').trim()}`}}).catch(()=>{})}catch(_){}}
function run(){seedExchangeAuth();install();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();setTimeout(run,150);setTimeout(run,600);setTimeout(run,1500);
})();
