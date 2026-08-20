(()=>{
  'use strict';
  if(window.__sbcTradeUiPolishV16)return;
  window.__sbcTradeUiPolishV16=true;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

  function hideDuplicateQuoteInfo(card){
    if(!card)return;
    $$('.quote-strip',card).forEach(el=>el.classList.add('trade-native-hidden-v28'));
    [...card.children].forEach(el=>{
      const text=(el.textContent||'').replace(/\s+/g,' ').toUpperCase();
      if(text.includes('CURRENT POSITION')&&text.includes('PRICE')&&!el.querySelector('.symbol-chart'))el.classList.add('trade-native-hidden-v28');
    });
  }
  function moveSymbolToChartHeader(view,card){
    const search=view.querySelector('.trade-search-row'),head=card?.querySelector('.card-head');if(!search||!head)return;
    search.classList.remove('trade-search-in-quick-v16');search.classList.add('trade-search-in-chart-v20');
    if(search.parentElement!==head)head.appendChild(search);head.classList.add('chart-head-with-selector-v20');
  }
  function polish(){const view=$('#view-portfolio');if(!view)return;const card=$('.chart-trade-card',view),quick=$('.quick-trade-clean',view);if(!quick)return;hideDuplicateQuoteInfo(card);moveSymbolToChartHeader(view,card);quick.classList.add('quick-trade-v16','quick-trade-v20');}
  function hook(name){const fn=window[name];if(typeof fn!=='function'||fn.__tradePolishV28)return;const wrapped=function(){const out=fn.apply(this,arguments);queueMicrotask(polish);return out;};wrapped.__tradePolishV28=true;window[name]=wrapped;}
  function run(){polish();['renderPortfolio','showView','refreshTradeTicket'].forEach(hook);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  setTimeout(run,300);setTimeout(run,1200);
})();