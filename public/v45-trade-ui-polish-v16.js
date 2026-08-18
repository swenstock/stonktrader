(()=>{
  'use strict';
  if(window.__sbcTradeUiPolishV16)return;
  window.__sbcTradeUiPolishV16=true;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

  function removeDuplicateQuoteInfo(card){
    if(!card)return;
    $$('.quote-strip',card).forEach(el=>el.remove());
    // Defensive cleanup for the older shell block even if its class changes.
    [...card.children].forEach(el=>{
      const text=(el.textContent||'').replace(/\s+/g,' ').toUpperCase();
      if(text.includes('CURRENT POSITION')&&text.includes('PRICE')&&!el.querySelector('.symbol-chart'))el.remove();
    });
  }

  function moveSymbolToChartHeader(view,card){
    const search=view.querySelector('.trade-search-row');
    const head=card?.querySelector('.card-head');
    if(!search||!head)return;
    search.classList.remove('trade-search-in-quick-v16');
    search.classList.add('trade-search-in-chart-v20');
    if(search.parentElement!==head)head.appendChild(search);
    head.classList.add('chart-head-with-selector-v20');
  }

  function polish(){
    const view=$('#view-portfolio');
    if(!view)return;
    const card=$('.chart-trade-card',view);
    const quick=$('.quick-trade-clean',view);
    if(!quick)return;
    removeDuplicateQuoteInfo(card);
    moveSymbolToChartHeader(view,card);
    quick.classList.add('quick-trade-v16','quick-trade-v20');
  }

  function run(){polish();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  let timer=null;
  const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,100);});
  obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(run,300);setTimeout(run,1200);setTimeout(run,2200);
})();
