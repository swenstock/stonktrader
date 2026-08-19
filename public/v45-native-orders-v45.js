(()=>{
'use strict';
if(window.__sbcNativeOrdersV45)return;window.__sbcNativeOrdersV45=true;
const STORE='sbcNativeWorkingOrdersV45';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function ctx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null}catch(_){return null}}
function portfolio(){try{return typeof currentPortfolio==='function'?currentPortfolio():null}catch(_){return null}}
function portfolioKey(c=ctx()){if(!c)return'';return [c.session||'',c.tier||c.tierId||'',c.entry||1,c.mode||'live'].join('|')}
function backendPortfolioId(){const p=portfolio(),c=ctx();return Number(p?.id||p?.portfolioId||c?.portfolioId||c?.portfolio_id||window.activePortfolioId||0)||null}
function load(){try{const x=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function save(rows){localStorage.setItem(STORE,JSON.stringify(rows.slice(-200)));window.dispatchEvent(new CustomEvent('sbc:working-orders-change'));}
function symbolFor(){return String($('#view-portfolio .trade-search-row select,#view-portfolio select')?.value||'').trim().toUpperCase()}
function money(n){return `$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}
function showAdvanced(body){const fire=()=>{try{if(window.SBCTradeConfirmV42?.showAdvanced){window.SBCTradeConfirmV42.showAdvanced(body);return true}}catch(_){}return false};if(!fire())setTimeout(fire,120)}
function showMessage(eyebrow,title,detail,subdetail,icon='📝'){const fire=()=>{try{if(window.SBCTradeConfirmV42?.show){window.SBCTradeConfirmV42.show({eyebrow,title,detail,subdetail,icon});return true}}catch(_){}return false};if(!fire())setTimeout(fire,120)}
function selectedSizing(ticket){
  const activeMode=$$('.quick-input-mode button',ticket).find(b=>b.classList.contains('active')||b.getAttribute('aria-pressed')==='true');
  const hinted=String(ticket.dataset.advMode||activeMode?.textContent||'percentage').toLowerCase();
  const mode=hinted.includes('share')?'shares':'percent';
  let percent=Number(ticket.dataset.advPercent||0);
  const activePct=$$('.quick-percent-row button',ticket).find(b=>b.classList.contains('active')||b.getAttribute('aria-pressed')==='true');
  if(activePct){const n=Number((activePct.textContent.match(/\d+/)||[])[0]);if(n)percent=n;}
  const candidates=$$('input[type="number"]',ticket).filter(x=>!x.classList.contains('adv-limit-price-v15')&&!x.classList.contains('adv-stop-price-v15'));
  const visible=candidates.find(x=>!x.hidden&&x.offsetParent!==null)||candidates[0];
  return {mode,percent:percent||50,quantity:Number(visible?.value||0)};
}
function validateOrder(ticket,btn){
  const p=portfolio(),c=ctx(),type=ticket.dataset.advType||'market',symbol=symbolFor(),side=/sell/i.test(btn.textContent||'')?'sell':'buy';
  if(!p||!c)throw new Error('Open a contest portfolio before placing an order.');
  if(!symbol)throw new Error('Choose a stock before placing the order.');
  if(type==='market')return null;
  const sizing=selectedSizing(ticket),limitPrice=Number($('.adv-limit-price-v15',ticket)?.value||0),stopPrice=Number($('.adv-stop-price-v15',ticket)?.value||0);
  if(['limit','stop_limit'].includes(type)&&!(limitPrice>0))throw new Error('Enter a valid limit price.');
  if(['stop','stop_limit'].includes(type)&&!(stopPrice>0))throw new Error('Enter a valid stop price.');
  if(sizing.mode==='shares'&&!(sizing.quantity>0))throw new Error('Enter a positive share quantity.');
  const h=p.holdings?.[symbol];
  if(side==='sell'&&(!h||Number(h.shares||0)<=0))throw new Error(`You don't own ${symbol}.`);
  return {id:`N${Date.now()}${Math.random().toString(36).slice(2,6)}`,portfolioKey:portfolioKey(c),session:c.session||'',tier:c.tier||c.tierId||'',entry:c.entry||1,side,symbol,orderType:type,mode:sizing.mode,percent:sizing.mode==='percent'?sizing.percent:null,quantity:sizing.mode==='shares'?sizing.quantity:null,limitPrice:limitPrice||null,stopPrice:stopPrice||null,stopTriggered:false,status:'working',createdAt:Date.now()};
}
function place(ticket,btn){
  try{
    const order=validateOrder(ticket,btn);if(!order)return false;
    const rows=load();rows.push(order);save(rows);
    showAdvanced({symbol:order.symbol,side:order.side,orderType:order.orderType,percent:order.percent,quantity:order.quantity,limitPrice:order.limitPrice,stopPrice:order.stopPrice});
    return true;
  }catch(e){showMessage('ORDER NOT PLACED','CHECK YOUR ORDER',e.message||String(e),'Nothing was submitted.','!');return false;}
}
function listForCurrent(){const key=portfolioKey();return key?load().filter(x=>x.portfolioKey===key&&x.status==='working'):[]}
function cancel(id){const rows=load(),x=rows.find(o=>o.id===id&&o.status==='working');if(!x)return false;x.status='cancelled';x.cancelledAt=Date.now();save(rows);showMessage('ORDER CANCELLED',`${String(x.orderType).replace('_',' ').toUpperCase()} ${x.side.toUpperCase()} • ${x.symbol}`,'REMOVED FROM WORKING ORDERS','No trade was executed.','×');return true}
function shouldTrigger(o,price){
  if(o.orderType==='limit')return o.side==='buy'?price<=o.limitPrice:price>=o.limitPrice;
  if(o.orderType==='stop')return o.side==='buy'?price>=o.stopPrice:price<=o.stopPrice;
  if(o.orderType==='stop_limit'){
    if(!o.stopTriggered){if(o.side==='buy'?price>=o.stopPrice:price<=o.stopPrice)o.stopTriggered=true;else return false;}
    return o.side==='buy'?price<=o.limitPrice:price>=o.limitPrice;
  }
  return false;
}
function portfolioValueNative(p){try{return typeof portfolioValue==='function'?Number(portfolioValue(p)):Number(p?.starting||100000)}catch(_){return Number(p?.starting||100000)}}
function orderQuantity(o,p,price){
  const h=p.holdings?.[o.symbol];
  if(o.mode==='shares')return Number(o.quantity||0);
  const pct=Number(o.percent||50)/100;
  if(o.side==='sell')return Number(h?.shares||0)*pct;
  const c=ctx(),isDegen=!!(c?.degen||String(c?.tier||c?.tierId||'').toLowerCase()==='hourly');
  if(isDegen)return Math.max(0,Number(p.cash||0)*pct/price);
  const value=portfolioValueNative(p),existing=Number(h?.shares||0)*Number(h?.avg||price),target=value*.10*pct;
  return Math.max(0,target-existing)/price;
}
function execute(o,price){
  const p=portfolio();if(!p||portfolioKey()!==o.portfolioKey)return {ok:false};
  const qty=orderQuantity(o,p,price);if(!(qty>0))return {ok:false,reason:'Order has no executable quantity at the current portfolio state.'};
  p.holdings=p.holdings||{};p.history=p.history||[];
  const h=p.holdings[o.symbol];
  if(o.side==='buy'){
    const cost=qty*price;if(cost>Number(p.cash||0)+.01)return {ok:false,reason:'Not enough cash when the order triggered.'};
    if(h){const nq=Number(h.shares||0)+qty;h.avg=((Number(h.avg||0)*Number(h.shares||0))+cost)/nq;h.shares=nq;}else p.holdings[o.symbol]={shares:qty,avg:price};
    p.cash=Number(p.cash||0)-cost;
  }else{
    if(!h||Number(h.shares||0)+1e-9<qty)return {ok:false,reason:'Not enough shares when the order triggered.'};
    h.shares=Number(h.shares||0)-qty;p.cash=Number(p.cash||0)+(qty*price);if(h.shares<=1e-9)delete p.holdings[o.symbol];
  }
  p.history.unshift({side:o.side.toUpperCase(),symbol:o.symbol,detail:`${qty.toFixed(4)} sh @ $${price.toFixed(2)} • ${String(o.orderType).replace('_',' ').toUpperCase()}`,time:'JUST NOW'});
  try{if(typeof renderPortfolio==='function')renderPortfolio()}catch(_){}
  showMessage('TRADE COMPLETE',`YOU ${o.side==='buy'?'BOUGHT':'SOLD'} ${qty.toLocaleString(undefined,{maximumFractionDigits:4})} ${o.symbol}`,`${money(price)} PER SHARE`,`${String(o.orderType).replace('_',' ').toUpperCase()} order triggered and executed.`,o.side==='buy'?'📈':'📉');
  return {ok:true,qty};
}
let monitoring=false;
async function monitor(){
  if(monitoring)return;const current=listForCurrent();if(!current.length)return;monitoring=true;
  try{
    const syms=[...new Set(current.map(x=>x.symbol))];
    const r=await fetch(`/api/quotes?symbols=${encodeURIComponent(syms.join(','))}`);if(!r.ok)return;
    const q=await r.json();const map=Object.fromEntries((Array.isArray(q)?q:[]).map(x=>[String(x.symbol).toUpperCase(),Number(x.price)]));
    const rows=load();let changed=false;
    for(const o of rows){if(o.status!=='working'||o.portfolioKey!==portfolioKey())continue;const price=map[o.symbol];if(!(price>0))continue;const before=o.stopTriggered;if(!shouldTrigger(o,price)){if(before!==o.stopTriggered)changed=true;continue;}const out=execute(o,price);if(out.ok){o.status='filled';o.filledAt=Date.now();o.executedPrice=price;o.executedQuantity=out.qty;changed=true;}else if(out.reason){o.status='rejected';o.failReason=out.reason;changed=true;showMessage('ORDER COULD NOT EXECUTE',`${o.side.toUpperCase()} ${o.symbol}`,out.reason,'The order was removed from Working Orders.','!');}}
    if(changed)save(rows);
  }catch(_){}finally{monitoring=false}
}
function intercept(e){
  const btn=e.target.closest?.('#view-portfolio .quick-trade-clean .quick-action');if(!btn)return;
  const ticket=btn.closest('.quick-trade-clean');if(!ticket)return;const type=ticket.dataset.advType||'market';if(type==='market'||backendPortfolioId())return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();place(ticket,btn);
}
document.addEventListener('click',intercept,true);
window.SBCNativeOrdersV45={listForCurrent,cancel,monitor,load,portfolioKey};
setInterval(monitor,1800);window.addEventListener('focus',monitor);document.addEventListener('visibilitychange',()=>{if(!document.hidden)monitor()});
})();