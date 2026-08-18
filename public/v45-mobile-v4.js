(()=>{
  const mq=window.matchMedia('(max-width:620px)');
  if(!mq.matches) return;

  function loadV5(){
    if(!document.querySelector('link[data-sbc-mobile-v5]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-mobile-v5.css?v=5';l.dataset.sbcMobileV5='1';document.head.appendChild(l);}
    if(!window.__sbcMobileV5&&!document.querySelector('script[data-sbc-mobile-v5]')){const s=document.createElement('script');s.src='/v45-mobile-v5.js?v=5';s.dataset.sbcMobileV5='1';document.head.appendChild(s);}
  }
  function loadV6(){
    if(!document.querySelector('link[data-sbc-mobile-v6]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-mobile-v6.css?v=6';l.dataset.sbcMobileV6='1';document.head.appendChild(l);}
    if(!window.__sbcMobileV6&&!document.querySelector('script[data-sbc-mobile-v6]')){const s=document.createElement('script');s.src='/v45-mobile-v6.js?v=6';s.dataset.sbcMobileV6='1';document.head.appendChild(s);}
  }
  function loadV7(){
    if(!document.querySelector('link[data-sbc-mobile-v7]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-mobile-v7.css?v=7';l.dataset.sbcMobileV7='1';document.head.appendChild(l);}
    if(!window.__sbcMobileV7&&!document.querySelector('script[data-sbc-mobile-v7]')){const s=document.createElement('script');s.src='/v45-mobile-v7.js?v=7';s.dataset.sbcMobileV7='1';document.head.appendChild(s);}
  }
  loadV5();loadV6();loadV7();

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
    const bidBtn=document.createElement('button');bidBtn.type='button';bidBtn.textContent='BIDS';bidBtn.setAttribute('aria-label','Show bids');
    const askBtn=document.createElement('button');askBtn.type='button';askBtn.textContent='OFFERS';askBtn.setAttribute('aria-label','Show offers');
    tabs.append(bidBtn,askBtn);books.parentNode.insertBefore(tabs,books);
    const bid=books.querySelector('.bid-book');const ask=books.querySelector('.ask-book');
    function show(which){
      bid?.classList.toggle('mobile-book-active',which==='bid');
      ask?.classList.toggle('mobile-book-active',which==='ask');
      bidBtn.classList.toggle('active',which==='bid');
      askBtn.classList.toggle('active',which==='ask');
      bidBtn.setAttribute('aria-selected',String(which==='bid'));askBtn.setAttribute('aria-selected',String(which==='ask'));
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
      const toggle=document.createElement('button');toggle.className='mobile-recent-toggle';toggle.type='button';toggle.textContent='RECENT SALES ▾';toggle.setAttribute('aria-expanded','false');
      recent.parentNode.insertBefore(toggle,recent);
      recent.classList.add('mobile-collapsed');
      toggle.onclick=()=>{recent.classList.toggle('mobile-collapsed');const open=!recent.classList.contains('mobile-collapsed');toggle.textContent=open?'RECENT SALES ▴':'RECENT SALES ▾';toggle.setAttribute('aria-expanded',String(open));};
    }

    const inv=document.querySelector('#view-exchange .portfolio h2');if(inv)inv.textContent='MY TICKETS';
  }

  const start=()=>{loadV5();loadV6();loadV7();stripFloorIcons();setupExchange();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();