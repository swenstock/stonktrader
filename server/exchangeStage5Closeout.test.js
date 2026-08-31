'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const v36=fs.readFileSync('public/v45-ticket-market-v36.js','utf8');
const layout=fs.readFileSync('public/v45-exchange-layout-sales-v1.js','utf8');
const history=fs.readFileSync('public/v45-exchange-history-stage2-v1.js','utf8');

for(const token of ['recentTicketSales','[3,17,42]','function ensurePanel','function renderMine','<h3>MY ORDERS</h3>']){
  assert(!v36.includes(token),`v36 legacy producer must be removed: ${token}`);
}
for(const token of ['ensureRealRecent','renderSales','refreshSales','/api/ticket-market/recent/','data-real-sales-refresh','sbcExchangeRealRecentSales']){
  assert(!layout.includes(token),`layout recent-sales producer must be removed: ${token}`);
}
for(const token of ['sbcExchangeStage5HistoryRetireStyle','display:none!important','ensureRetirementStyles']){
  assert(!history.includes(token),`history close-out must not suppress retired producers with CSS: ${token}`);
}
assert(v36.includes('Your active order'),'visible own-book copy must not refer to retired My Orders');

function extract(name){
  const start=v36.indexOf(`async function ${name}(`);
  assert(start>=0,`${name} must exist`);
  let i=v36.indexOf('{',start),depth=0,end=-1;
  for(;i<v36.length;i++){
    if(v36[i]==='{')depth++;
    else if(v36[i]==='}'&&--depth===0){end=i+1;break;}
  }
  assert(end>start,`${name} function body must parse`);
  return v36.slice(start,end);
}

(async()=>{
  const refreshCalls=[];
  const refreshCtx={
    currentType:()=> 'runner',
    activeOrders:async()=>{refreshCalls.push('orders');return[{ticketType:'runner',side:'bid',id:7,bidPrice:100}]},
    decorateMyTickets:async()=>refreshCalls.push('tickets'),
    decorateBook:rows=>{assert.strictEqual(rows.length,1);refreshCalls.push('book')},
    renderBurn:async()=>refreshCalls.push('ladder'),
    window:{__SBC_EXCHANGE_LAYOUT_SALES_V1:{placeUpgradeLadder:()=>refreshCalls.push('place-ladder')}}
  };
  vm.createContext(refreshCtx);
  vm.runInContext(`${extract('refreshAccountExchangeState')};this.refreshAccountExchangeState=refreshAccountExchangeState;`,refreshCtx);
  const rows=await refreshCtx.refreshAccountExchangeState();
  assert.strictEqual(rows.length,1);
  assert.deepStrictEqual(refreshCalls,['orders','tickets','book','ladder','place-ladder']);

  const burnCalls=[];
  const burnCtx={
    TYPE_LABELS:{runner:'RUNNER'},
    confirm:()=>true,
    api:async(path,opts)=>{burnCalls.push(['api',path,JSON.parse(opts.body).sourceType]);return{ok:true}},
    refreshAccountExchangeState:async()=>burnCalls.push(['refresh']),
    alert:e=>{throw e},
    Date,Math,JSON
  };
  vm.createContext(burnCtx);
  vm.runInContext(`${extract('burnTickets')};this.burnTickets=burnTickets;`,burnCtx);
  await burnCtx.burnTickets('runner');
  assert.strictEqual(burnCalls.filter(x=>x[0]==='refresh').length,1,'post-burn must use one shared refresh path');
  assert.deepStrictEqual(burnCalls[0].slice(0,3),['api','/api/tickets/burn-upgrade','runner']);

  assert(v36.includes("function schedule(){clearTimeout(timer);timer=setTimeout(()=>{ensureModalControls();refreshAccountExchangeState().catch(()=>{})},90)"),'scheduled initial/event refresh must call refreshAccountExchangeState');
  assert(!v36.includes('renderMine().catch'),'no alternate hidden My Orders refresh path may survive');

  console.log('Exchange Stage 5 Source Close-out: PASS');
  console.log('LEGACY_PRODUCERS=removed-at-source');
  console.log('MY_ORDERS_CONTAINER=retired');
  console.log('ACCOUNT_REFRESH=single-owner');
  console.log('BURN_REFRESH=shared-path-once');
  console.log('RECENT_SALES_API_POLLING=retired');
})();
