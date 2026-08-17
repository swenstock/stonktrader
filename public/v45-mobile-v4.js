(()=>{
  const mq=window.matchMedia('(max-width:620px)');
  if(!mq.matches) return;

  function stripFloorIcons(){
    document.querySelectorAll('.mobile-floor-icons').forEach(x=>x.remove());
  }

  function setupExchange(){
    const page=document.querySelector('#view-exchange .exchange-page');
    if(!page||page.dataset.mobileV4==='1') return;
    page.dataset.mobileV4='1';

    const selector=document.getElementById('ticketTypeSelector');
    const marketPanel=document.getElementById('marketTicketTitle')?.closest('.panel');
    const marketSummary=document.querySelector('#view-exchange .market-summary');
    const books=marketPanel?.querySelector('.ticket-market-grid');
    if(!selector||!marketPanel||!books) return;

    const focus=document.createElement('section');
    focus.className='mobile-exchange-focus panel';
    focus.innerHTML=`<div class="mobile-exchange-selected"></div><div class="mobile-exchange-stats"></div>`;
    selector.parentNode.insertBefore(focus,selector);

    const statHost=focus.querySelector('.mobile-exchange-stats');
    if(marketSummary){
      [...marketSummary.children].slice(0,3).forEach(s=>statHost.appendChild(s));
      marketSummary.style.display='none';
    }

    const selectedHost=focus.querySelector('.mobile-exchange-selected');
    function refreshSelected(btn){
      const active=btn||selector.querySelector('.active')||selector.querySelector('button');
      if(!active)return;
      const name=(active.querySelector('.ticket-filter-name')?.textContent||'TICKET').trim();
      const count=(active.querySelector('.ticket-filter-count')?.textContent||'').trim();
      const artNode=active.querySelector('.ticket-filter-art');
      selectedHost.innerHTML='';
      const art=document.createElement('div');art.className='mobile-exchange-art';
      const im=artNode?.querySelector('img');
      if(im){const clone=im.cloneNode(true);art.appendChild(clone);}else{art.textContent='🏆';}
      const copy=document.createElement('div');copy.innerHTML=`<small>SELECTED MARKET</small><b>${name}</b><span>${count}</span>`;
      selectedHost.append(art,copy);
    }
    refreshSelected();

    selector.addEventListener('click',e=>{
      const btn=e.target.closest('button');
      if(!btn)return;
      setTimeout(()=>refreshSelected(btn),0);
    });

    const tabs=document.createElement('div');tabs.className='mobile-book-tabs';
    const bidBtn=document.createElement('button');bidBtn.type='button';bidBtn.textContent='BIDS';
    const askBtn=document.createElement('button');askBtn.type='button';askBtn.textContent='OFFERS';
    tabs.append(bidBtn,askBtn);books.parentNode.insertBefore(tabs,books);
    const bid=books.querySelector('.bid-book');const ask=books.querySelector('.ask-book');
    function show(which){
      bid?.classList.toggle('mobile-book-active',which==='bid');
      ask?.classList.toggle('mobile-book-active',which==='ask');
      bidBtn.classList.toggle('active',which==='bid');
      askBtn.classList.toggle('active',which==='ask');
    }
    bidBtn.onclick=()=>show('bid');askBtn.onclick=()=>show('ask');show('bid');

    const head=marketPanel.querySelector('.card-head');
    if(head){
      const h=head.querySelector('h2');if(h)h.textContent='BUY OR SELL';
      const s=head.querySelector('span');if(s)s.textContent='One ticket per order.';
    }
    const expl=marketPanel.querySelector('.market-explainer');
    if(expl)expl.innerHTML='<b>Fast path:</b> buy an offer or sell to a bid.';

    const recent=document.querySelector('#view-exchange .orderbook');
    if(recent){
      const toggle=document.createElement('button');toggle.className='mobile-recent-toggle';toggle.type='button';toggle.textContent='RECENT SALES ▾';
      recent.parentNode.insertBefore(toggle,recent);
      recent.classList.add('mobile-collapsed');
      toggle.onclick=()=>{recent.classList.toggle('mobile-collapsed');toggle.textContent=recent.classList.contains('mobile-collapsed')?'RECENT SALES ▾':'RECENT SALES ▴';};
    }

    const inv=document.querySelector('#view-exchange .portfolio h2');if(inv)inv.textContent='MY TICKETS';
  }

  const start=()=>{stripFloorIcons();setupExchange();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();