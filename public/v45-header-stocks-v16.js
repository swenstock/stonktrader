(()=>{
  'use strict';
  if(window.__sbcHeaderStocksV16)return;
  window.__sbcHeaderStocksV16=true;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

  function normalizeHeader(){
    const head=$('#view-portfolio .trade-head');
    const title=$('#portfolioTitle');
    const subtitle=$('#portfolioSubtitle');
    if(!head||!title||!subtitle)return;

    let copy=title.closest('.trade-head-copy');
    if(!copy){
      copy=title.parentElement;
      if(!copy)return;
      copy.classList.add('trade-head-copy');
    }

    // Preserve one broker visual before removing the nested rows created by v10.
    const sourceArt=$('.tier-broker-title-art',head);
    let artClone=null;
    if(sourceArt){
      artClone=sourceArt.cloneNode(true);
      artClone.removeAttribute('id');
    }

    // Pull the title back to the stable copy container, then remove every old row.
    copy.insertBefore(title,subtitle);
    $$('.trade-head-title-row',copy).forEach(r=>r.remove());
    $$('.trade-rule-badge,.trade-rule-review,.tier-broker-title-art',head).forEach(x=>x.remove());

    const row=document.createElement('div');
    row.className='trade-head-title-row header-row-v16';
    copy.insertBefore(row,title);
    if(artClone){artClone.classList.add('header-art-v16');row.appendChild(artClone);}
    row.appendChild(title);

    const ctx=(()=>{try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null;}catch(_){return null;}})();
    const degen=!!ctx?.degen;
    const badge=document.createElement('span');
    badge.className='trade-rule-badge header-rule-v16'+(degen?' degen':'');
    badge.id='tradeRuleBadge';
    badge.textContent=degen?'DEGEN • NO POSITION CAP':'STANDARD • 10% MAX AT ENTRY';
    row.appendChild(badge);

    const rules=document.createElement('button');
    rules.type='button';rules.className='trade-rule-review header-rules-v16';rules.textContent='RULES';
    rules.onclick=()=>{try{if(typeof showRulesForCurrentPortfolio==='function')showRulesForCurrentPortfolio();}catch(_){}};
    row.appendChild(rules);

    // Sentinel: v10 searches the title's parent for a descendant .trade-head-title-row.
    // Keeping one hidden descendant prevents it from wrapping this row again.
    const sentinel=document.createElement('span');
    sentinel.className='trade-head-title-row header-row-sentinel-v16';
    sentinel.setAttribute('aria-hidden','true');
    row.appendChild(sentinel);
  }

  let dialog=null,allStocks=[];
  function stockName(x){return String(x?.name||x?.company||x?.companyName||'').trim();}
  function stockSymbol(x){return String(x?.symbol||x||'').trim().toUpperCase();}
  function renderStocks(filter=''){
    if(!dialog)return;
    const q=String(filter||'').trim().toLowerCase();
    const rows=allStocks.filter(x=>{
      const s=stockSymbol(x),n=stockName(x);
      return !q||s.toLowerCase().includes(q)||n.toLowerCase().includes(q);
    });
    const count=$('.stock-list-count-v16',dialog);if(count)count.textContent=`${rows.length} STOCK${rows.length===1?'':'S'}`;
    const list=$('.stock-list-grid-v16',dialog);if(!list)return;
    list.innerHTML=rows.length?rows.map(x=>{
      const s=stockSymbol(x),n=stockName(x);
      return `<button type="button" class="stock-list-item-v16" data-stock-v16="${s.replace(/"/g,'&quot;')}"><b>${s}</b><span>${n||'SBC tradable stock'}</span></button>`;
    }).join(''):'<div class="stock-list-empty-v16">No matching SBC stocks.</div>';
    $$('[data-stock-v16]',list).forEach(b=>b.onclick=()=>{
      const symbol=b.dataset.stockV16;
      const select=$('#view-portfolio .trade-search-row select');
      if(select){select.value=symbol;select.dispatchEvent(new Event('change',{bubbles:true}));}
      closeStocks();
    });
  }
  function ensureDialog(){
    if(dialog)return dialog;
    dialog=document.createElement('div');
    dialog.className='stock-list-overlay-v16';
    dialog.setAttribute('aria-hidden','true');
    dialog.innerHTML=`<section class="stock-list-modal-v16" role="dialog" aria-modal="true" aria-labelledby="stockListTitleV16">
      <header><div><small>SBC STOCK UNIVERSE</small><h2 id="stockListTitleV16">AVAILABLE STOCKS</h2><p>Alphabetized from the symbols currently enabled on the SBC server.</p></div><button type="button" class="stock-list-close-v16" aria-label="Close">×</button></header>
      <div class="stock-list-tools-v16"><input type="search" class="stock-list-search-v16" placeholder="Search ticker or company…" autocomplete="off"><b class="stock-list-count-v16"></b></div>
      <div class="stock-list-grid-v16"></div>
    </section>`;
    document.body.appendChild(dialog);
    $('.stock-list-close-v16',dialog).onclick=closeStocks;
    $('.stock-list-search-v16',dialog).addEventListener('input',e=>renderStocks(e.target.value));
    dialog.addEventListener('click',e=>{if(e.target===dialog)closeStocks();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.classList.contains('open'))closeStocks();});
    return dialog;
  }
  function closeStocks(){if(!dialog)return;dialog.classList.remove('open');dialog.setAttribute('aria-hidden','true');}
  async function openStocks(){
    ensureDialog();
    dialog.classList.add('open');dialog.setAttribute('aria-hidden','false');
    const list=$('.stock-list-grid-v16',dialog);if(list)list.innerHTML='<div class="stock-list-empty-v16">Loading SBC stocks…</div>';
    try{
      const r=await fetch('/api/quotes/symbols');
      const data=await r.json();
      allStocks=(Array.isArray(data)?data:[]).slice().sort((a,b)=>stockSymbol(a).localeCompare(stockSymbol(b)));
      const search=$('.stock-list-search-v16',dialog);if(search){search.value='';setTimeout(()=>search.focus(),0);}
      renderStocks('');
    }catch(_){if(list)list.innerHTML='<div class="stock-list-empty-v16">Could not load the SBC stock list.</div>';}
  }
  function ensureStockButton(){
    const ticket=$('#view-portfolio .quick-trade-clean');
    const head=ticket?.querySelector('.quick-trade-head');
    if(!ticket||!head||$('.available-stocks-v16',head))return;
    const btn=document.createElement('button');btn.type='button';btn.className='available-stocks-v16';btn.textContent='AVAILABLE STOCKS';btn.onclick=openStocks;
    const basket=$('.quick-ticket-launch',head);
    if(basket)head.insertBefore(btn,basket);else head.appendChild(btn);
  }

  function run(){normalizeHeader();ensureStockButton();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  let t=null;
  const obs=new MutationObserver(()=>{clearTimeout(t);t=setTimeout(run,120);});
  obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(run,350);setTimeout(run,1200);setTimeout(run,2200);
})();
