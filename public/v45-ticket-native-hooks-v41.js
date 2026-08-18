(()=>{
'use strict';
if(window.__sbcTicketNativeHooksV41)return;window.__sbcTicketNativeHooksV41=true;
const ORDER_STORE='sbcTicketMarketOrdersV36';
const SETTLE_STORE='sbcTicketSettlementV38';
const NAME_TO_TYPE={'MAIN EVENT':'main_event','JR. STONKBROKER':'junior','JUNIOR':'junior','TRADER':'trader','CLERK':'clerk','RUNNER':'runner'};
let lastAction='',lastActionAt=0;
function typeFromName(name){const u=String(name||'').toUpperCase();for(const [n,t] of Object.entries(NAME_TO_TYPE))if(u.includes(n))return t;return'main_event';}
function market(){try{return typeof ticketMarket==='function'?ticketMarket():null}catch(_){return null}}
function currentName(){try{return String(activeTicketMarket||'Main Event')}catch(_){const t=document.getElementById('marketTicketTitle')?.textContent||'Main Event';return t.replace(/\s+TICKET MARKET.*$/i,'').trim();}}
function dedupe(key,ms=900){const now=Date.now();if(key===lastAction&&now-lastActionAt<ms)return false;lastAction=key;lastActionAt=now;return true;}
function orderRows(){try{const x=JSON.parse(localStorage.getItem(ORDER_STORE)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function saveOrders(x){try{localStorage.setItem(ORDER_STORE,JSON.stringify(x))}catch(_){}}
function ensureLocalOrder(side,name,price,ticketId=''){
  price=Math.round(Number(price));if(!(price>0))return;
  const type=typeFromName(name),rows=orderRows();
  const recent=rows.find(o=>o.status==='active'&&o.side===side&&o.ticketType===type&&Number(o.price)===price&&Date.now()-Date.parse(o.createdAt||0)<2500);
  if(recent)return;
  rows.unshift({id:`native-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,side,ticketType:type,price,status:'active',ticketId,createdAt:new Date().toISOString()});
  saveOrders(rows);
}
function fillLocalOrder(side,name,price){const type=typeFromName(name),rows=orderRows();const i=rows.findIndex(o=>o.status==='active'&&o.side===side&&o.ticketType===type&&Number(o.price)===Number(price));if(i>=0){rows[i].status='filled';saveOrders(rows);}}
function settleState(){try{const x=JSON.parse(localStorage.getItem(SETTLE_STORE)||'{}');return{x:{...(x.x||{})},trades:Array.isArray(x.trades)?x.trades:[]}}catch(_){return{x:{},trades:[]}}}
function saveSettlement(x){try{localStorage.setItem(SETTLE_STORE,JSON.stringify(x))}catch(_){}}
function ensureFill(name,side,price,delta){price=Math.round(Number(price));if(!(price>0))return;const type=typeFromName(name),st=settleState();const recent=st.trades[0];if(recent&&recent.type===type&&recent.side===side&&Number(recent.price)===price&&Date.now()-Date.parse(recent.at||0)<1800)return;st.x[type]=Number(st.x[type]||0)+delta;st.trades.unshift({type,side,price,at:new Date().toISOString()});st.trades=st.trades.slice(0,50);saveSettlement(st);}
function insertPrice(side,price){const m=market();if(!m)return;const arr=side==='offer'?m.asks:m.bids;if(!Array.isArray(arr))return;arr.push(Math.round(Number(price)));arr.sort(side==='offer'?(a,b)=>a-b:(a,b)=>b-a);}
function removePrice(side,price){const m=market();if(!m)return;const arr=side==='offer'?m.asks:m.bids;if(!Array.isArray(arr))return;const i=arr.findIndex(x=>Number(x)===Number(price));if(i>=0)arr.splice(i,1);}
function redraw(price){const m=market();if(m&&Number(price)>0)m.last=Math.round(Number(price));try{if(typeof renderTicketMarket==='function')renderTicketMarket()}catch(_){}window.dispatchEvent(new CustomEvent('sbc:ticket-market-changed'));}
function bidTerms(){let best=0,ask=Infinity;try{best=Number(bidOrder?.bestBid||0);ask=Number(bidOrder?.ask||Infinity)}catch(_){}return{best,ask};}
function install(){
  if(typeof window.confirmTicketOrder==='function'&&!window.confirmTicketOrder.__sbcV41){const original=window.confirmTicketOrder;const wrapped=function(){let side='',name=currentName(),price=Number(document.getElementById('ticketOrderPrice')?.value||0),ticketId='';try{side=String(ticketOrder?.side||'');name=String(ticketOrder?.name||name);price=Number(ticketOrder?.side==='SELL'?document.getElementById('ticketOrderPrice')?.value:ticketOrder?.price)||price;ticketId=String(ticketOrder?.listingId||'')}catch(_){}const result=original.apply(this,arguments);const key=`ticket:${side}:${name}:${price}:${ticketId}`;if(!dedupe(key))return result;if(side==='SELL'){ensureLocalOrder('offer',name,price,ticketId);insertPrice('offer',price);redraw();}else if(side==='BUY'){fillLocalOrder('offer',name,price);removePrice('offer',price);ensureFill(name,'BUY',price,1);redraw(price);}return result;};wrapped.__sbcV41=true;window.confirmTicketOrder=wrapped;}
  if(typeof window.updateBidOrderSummary==='function'&&!window.updateBidOrderSummary.__sbcV42){const original=window.updateBidOrderSummary;const wrapped=function(){const terms=bidTerms();let changed=false;try{if(typeof bidOrder!=='undefined'){bidOrder.bestBid=0;changed=true}}catch(_){}let result;try{result=original.apply(this,arguments)}finally{if(changed){try{bidOrder.bestBid=terms.best}catch(_){}}}const price=Math.round(Number(document.getElementById('bidOrderPrice')?.value||0));const valid=price>=1&&price<terms.ask;const btn=document.querySelector('#bidOrderModal .confirm');if(btn){btn.disabled=!valid;btn.style.opacity=valid?'1':'.45';}const box=document.getElementById('bidOrderSummary');const note=box?.lastElementChild;if(note){if(price<1)note.textContent='Enter a bid of at least 1 STONK.';else if(price>=terms.ask)note.textContent=`That reaches the ${terms.ask.toLocaleString()} STONK lowest Ask. Buy the Ask instead for an immediate fill.`;else if(price<=terms.best)note.textContent=`Your ${price.toLocaleString()} STONK Bid will rest below the current ${terms.best.toLocaleString()} STONK highest Bid.`;else note.textContent='Your Bid becomes the highest posted offer if the market has not changed.';}return result;};wrapped.__sbcV42=true;window.updateBidOrderSummary=wrapped;}
  if(typeof window.confirmBidOrder==='function'&&!window.confirmBidOrder.__sbcV42){const original=window.confirmBidOrder;const wrapped=function(){let name=currentName(),price=Math.round(Number(document.getElementById('bidOrderPrice')?.value||0));const terms=bidTerms(),valid=price>=1&&price<terms.ask;if(!valid)return;let changed=false;try{if(typeof bidOrder!=='undefined'){name=String(bidOrder?.name||name);bidOrder.bestBid=0;changed=true}}catch(_){}let result;try{result=original.apply(this,arguments)}finally{if(changed){try{bidOrder.bestBid=terms.best}catch(_){}}}const key=`bid:${name}:${price}`;if(!dedupe(key))return result;ensureLocalOrder('bid',name,price);insertPrice('bid',price);redraw();return result;};wrapped.__sbcV42=true;window.confirmBidOrder=wrapped;}
  if(typeof window.hitBestBid==='function'&&!window.hitBestBid.__sbcV41){const original=window.hitBestBid;const wrapped=function(){const name=currentName(),m=market(),price=Number(m?.bids?.[0]||0);const result=original.apply(this,arguments);const key=`sellbest:${name}:${price}`;if(dedupe(key)){fillLocalOrder('bid',name,price);removePrice('bid',price);ensureFill(name,'SELL',price,-1);redraw(price);}return result;};wrapped.__sbcV41=true;window.hitBestBid=wrapped;}
  if(typeof window.sellIntoBid==='function'&&!window.sellIntoBid.__sbcV41){const original=window.sellIntoBid;const wrapped=function(price){const name=currentName(),p=Number(price||0),result=original.apply(this,arguments),btn=document.getElementById('hitBidBtn');if(btn){const native=btn.onclick;btn.onclick=function(ev){const r=typeof native==='function'?native.call(this,ev):undefined;const key=`sellbid:${name}:${p}`;if(dedupe(key)){fillLocalOrder('bid',name,p);removePrice('bid',p);ensureFill(name,'SELL',p,-1);redraw(p);}return r;};}return result;};wrapped.__sbcV41=true;window.sellIntoBid=wrapped;}
}
function run(){install();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
setTimeout(run,150);setTimeout(run,600);setTimeout(run,1500);
})();
