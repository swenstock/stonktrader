(()=>{
  let orderTab='queued';
  let successOverlay=null;

  function currentP(){ try{return typeof currentPortfolio==='function'?currentPortfolio():null;}catch(e){return null;} }
  function currentCtx(){ try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null;}catch(e){return null;} }
  function money(n){ try{return typeof formatMoney==='function'?formatMoney(n):`$${Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}`;}catch(e){return `$${Number(n||0).toLocaleString()}`;} }

  function setOrderTab(which){
    orderTab=which;
    document.querySelectorAll('.orders-activity-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.ordersTab===which));
    const q=document.getElementById('queuedOrders');
    const h=document.getElementById('tradeHistory');
    if(q)q.hidden=which!=='queued';
    if(h)h.hidden=which!=='activity';
  }

  function consolidateOrdersPanel(){
    const grid=document.querySelector('.bottom-trade-grid');
    const queue=grid?.querySelector('.queue-card');
    const history=grid?.querySelector('.history-card');
    const qList=document.getElementById('queuedOrders');
    const hList=document.getElementById('tradeHistory');
    if(!grid||!queue||!history||!qList||!hList)return;

    queue.classList.add('orders-activity-card');
    const head=queue.querySelector('.card-head');
    const title=head?.querySelector('h2');
    const sub=head?.querySelector('span');
    if(title && title.textContent!=='ORDERS & ACTIVITY'){ title.textContent='ORDERS & ACTIVITY'; title.removeAttribute('id'); }
    if(sub && sub.textContent!=='Queued orders and recent trades'){ sub.textContent='Queued orders and recent trades'; sub.removeAttribute('id'); }

    if(!queue.querySelector('.orders-activity-tabs')){
      const tabs=document.createElement('div');tabs.className='orders-activity-tabs';
      tabs.innerHTML='<button type="button" data-orders-tab="queued">QUEUED</button><button type="button" data-orders-tab="activity">RECENT ACTIVITY</button>';
      tabs.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>setOrderTab(btn.dataset.ordersTab)));
      head?.after(tabs);
    }

    if(hList.parentElement!==queue){
      const pane=document.createElement('div');pane.className='orders-pane activity-pane';pane.appendChild(hList);queue.appendChild(pane);
    }
    history.style.display='none';

    if(!document.getElementById('queueTitle')){
      const ghost=document.createElement('span');ghost.id='queueTitle';ghost.hidden=true;queue.appendChild(ghost);
    }
    if(!document.getElementById('queueSubtitle')){
      const ghost=document.createElement('span');ghost.id='queueSubtitle';ghost.hidden=true;queue.appendChild(ghost);
    }
    setOrderTab(orderTab);
  }

  function buildDesktopLeftStack(){
    if(!window.matchMedia('(min-width:901px)').matches)return;
    const layout=document.querySelector('.trade-layout');
    const holdings=layout?.querySelector('.holdings-card');
    const grid=document.querySelector('.bottom-trade-grid');
    if(!layout||!holdings||!grid)return;
    layout.classList.add('usability-v5');
    if(!layout.querySelector('.trade-left-stack')){
      const stack=document.createElement('div');stack.className='trade-left-stack';
      layout.insertBefore(stack,holdings);stack.appendChild(holdings);stack.appendChild(grid);
    }
  }

  function renderEmptyPortfolioFramework(){
    const p=currentP();
    const card=document.querySelector('.holdings-card');
    const body=document.getElementById('portfolioHoldings');
    if(!p||!card||!body)return;
    const rows=Object.keys(p.holdings||{});
    const empty=rows.length===0;
    card.classList.toggle('empty-portfolio',empty);
    let kpis=card.querySelector('.empty-portfolio-kpis');
    if(!empty){ if(kpis)kpis.remove(); return; }
    if(!kpis){ kpis=document.createElement('div');kpis.className='empty-portfolio-kpis';card.querySelector('.card-head')?.after(kpis); }
    const cash=Number(p.cash??100000);
    kpis.innerHTML=`<div class="empty-kpi"><span>PORTFOLIO VALUE</span><b>${money(cash)}</b></div><div class="empty-kpi"><span>INVESTED</span><b>$0</b></div><div class="empty-kpi good"><span>P&L</span><b>+$0.00</b></div><div class="empty-kpi"><span>POSITIONS</span><b>0</b></div>`;
    if(!body.querySelector('.empty-cash-row')) body.innerHTML=`<tr class="empty-cash-row"><td><span class="cash-label">CASH</span><span class="cash-sub">100% uninvested</span></td><td>—</td><td>—</td><td>—</td><td>${money(cash)} • 100%</td><td class="pl-good">+$0.00 • 0.0%</td></tr>`;
  }

  function ensureSuccessOverlay(){
    if(successOverlay)return successOverlay;
    successOverlay=document.createElement('div');successOverlay.className='queue-success-overlay';successOverlay.hidden=true;
    successOverlay.innerHTML=`<div class="queue-success-card" role="dialog" aria-modal="true" aria-labelledby="queueSuccessTitle"><div class="queue-success-icon">✓</div><h2 id="queueSuccessTitle">ORDER QUEUED</h2><p>Your order is saved and will execute when the session opens.</p><div class="queue-success-detail" id="queueSuccessDetail"></div><div class="queue-success-actions"><button type="button" class="primary" id="queueViewOrders">VIEW MY ORDERS</button><button type="button" id="queueKeepTrading">KEEP TRADING</button></div><span class="queue-success-help">You can cancel queued orders before the session opens.</span></div>`;
    document.body.appendChild(successOverlay);
    successOverlay.querySelector('#queueKeepTrading').onclick=()=>successOverlay.hidden=true;
    successOverlay.querySelector('#queueViewOrders').onclick=()=>{successOverlay.hidden=true;setOrderTab('queued');const card=document.querySelector('.orders-activity-card');card?.scrollIntoView({behavior:'smooth',block:'center'});};
    successOverlay.addEventListener('click',e=>{if(e.target===successOverlay)successOverlay.hidden=true;});
    return successOverlay;
  }

  function showQueueSuccess(order){
    const overlay=ensureSuccessOverlay();
    const detail=overlay.querySelector('#queueSuccessDetail');
    if(detail)detail.innerHTML=`<b>${order.side} ${order.symbol}</b>${order.detail}<br><span>Executes at session open</span>`;
    overlay.hidden=false;
  }

  function patchSubmit(){
    if(typeof window.submitPortfolioOrder!=='function'||window.submitPortfolioOrder.__usabilityV5)return;
    const original=window.submitPortfolioOrder;
    function wrapped(){
      const ctx=currentCtx();const p=currentP();const before=p?.queued?.length||0;
      const out=original.apply(this,arguments);
      const p2=currentP();
      if(ctx?.mode==='reserve' && (p2?.queued?.length||0)>before){const order=p2.queued[p2.queued.length-1];showQueueSuccess(order);}
      setTimeout(runOnce,50);
      return out;
    }
    wrapped.__usabilityV5=true;window.submitPortfolioOrder=wrapped;
  }

  function runOnce(){
    consolidateOrdersPanel();
    buildDesktopLeftStack();
    renderEmptyPortfolioFramework();
    setOrderTab(orderTab);
  }

  function start(){
    patchSubmit();
    runOnce();
    setTimeout(runOnce,400);
    setTimeout(runOnce,1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
