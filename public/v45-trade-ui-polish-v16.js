(()=>{
  'use strict';
  if(window.__sbcTradeUiPolishV16)return;
  window.__sbcTradeUiPolishV16=true;
  const $=(s,r=document)=>r.querySelector(s);

  function polish(){
    const view=$('#view-portfolio');
    if(!view)return;
    const card=$('.chart-trade-card',view);
    const quick=$('.quick-trade-clean',view);
    const head=$('.quick-trade-head',quick||view);
    if(!quick||!head)return;

    // The old price/current-position strip duplicates information already shown
    // in the portfolio and trade card, so remove it completely.
    card?.querySelectorAll('.quote-strip').forEach(el=>el.remove());

    // Keep stock selection available, but make it part of Quick Trade instead
    // of leaving a separate block floating above the order ticket.
    const search=card?.querySelector('.trade-search-row')||view.querySelector('.trade-search-row');
    if(search&&search.parentElement!==head){
      search.classList.add('trade-search-in-quick-v16');
      const basket=head.querySelector('.quick-ticket-launch');
      head.insertBefore(search,basket||null);
    } else if(search){
      search.classList.add('trade-search-in-quick-v16');
    }

    quick.classList.add('quick-trade-v16');
  }

  function run(){polish();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  let timer=null;
  const obs=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(run,80);});
  obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(run,300);setTimeout(run,1200);
})();
