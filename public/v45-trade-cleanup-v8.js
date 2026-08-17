(()=>{
  function getCtx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null;}catch(e){return null;}}

  function hardPauseTutorials(){
    try{
      localStorage.setItem('sbcDisableMainTutorialV45','1');
      ['lobby','floor','my','tier','portfolio','exchange','leaders'].forEach(v=>localStorage.setItem('sbcDisableViewTutorialV45:'+v,'1'));
    }catch(e){}
    ['tutorialWelcome','tutorialOverlay'].forEach(id=>document.getElementById(id)?.classList.remove('open'));
    const noop=()=>{};
    ['maybeShowFirstVisitTutorial','maybeShowContextTutorial','startTutorial','startViewTutorial','replayCurrentTutorial','beginTutorialFromWelcome','renderTutorialStep'].forEach(name=>{try{window[name]=noop;}catch(e){}});
  }

  function ensureHeaderRule(){
    const head=document.querySelector('#view-portfolio .trade-head');
    const title=document.getElementById('portfolioTitle');
    const subtitle=document.getElementById('portfolioSubtitle');
    if(!head||!title||!subtitle)return;
    const copy=title.parentElement;if(!copy)return;
    copy.classList.add('trade-head-copy');
    let row=copy.querySelector('.trade-head-title-row');
    if(!row){
      row=document.createElement('div');row.className='trade-head-title-row';
      copy.insertBefore(row,title);row.appendChild(title);
      const badge=document.createElement('span');badge.className='trade-rule-badge';badge.id='tradeRuleBadge';row.appendChild(badge);
      const review=document.createElement('button');review.type='button';review.className='trade-rule-review';review.textContent='RULES';review.onclick=()=>{try{showRulesForCurrentPortfolio();}catch(e){}};row.appendChild(review);
    }
    const ctx=getCtx();const degen=!!ctx?.degen;
    const badge=document.getElementById('tradeRuleBadge');
    if(badge){badge.classList.toggle('degen',degen);badge.textContent=degen?'DEGEN • NO POSITION CAP':'STANDARD • 10% MAX AT ENTRY';}
  }

  function ensureLeftStack(){
    if(!window.matchMedia('(min-width:901px)').matches)return;
    const layout=document.querySelector('#view-portfolio .trade-layout');
    const holdings=layout?.querySelector('.holdings-card');
    if(!layout||!holdings)return;
    let stack=layout.querySelector('.trade-left-stack');
    if(!stack){stack=document.createElement('div');stack.className='trade-left-stack';layout.insertBefore(stack,holdings);stack.appendChild(holdings);}
    const analytics=document.getElementById('analyticsDock');
    const advanced=document.getElementById('advancedCharts');
    const orders=document.querySelector('.bottom-trade-grid');
    [analytics,advanced,orders].forEach(el=>{if(el&&el.parentElement!==stack)stack.appendChild(el);});
  }

  function defaultPercentMode(){
    const ctx=getCtx();if(!ctx)return;
    const key=[ctx.session,ctx.tier,ctx.entry,ctx.mode].join('|');
    if(document.body.dataset.percentDefaultContext===key)return;
    document.body.dataset.percentDefaultContext=key;
    try{
      if(typeof setTradeInputMode==='function')setTradeInputMode('percent');
      const btn=[...document.querySelectorAll('.quick-percent-row button')].find(b=>b.textContent.trim()==='50%');
      if(typeof selectQuickPercent==='function')selectQuickPercent(50,btn);
    }catch(e){}
  }

  function patchConfirmRules(){
    if(typeof window.confirmRulesGate!=='function'||window.confirmRulesGate.__v8)return;
    const original=window.confirmRulesGate;
    function wrapped(){const out=original.apply(this,arguments);setTimeout(()=>{hardPauseTutorials();ensureHeaderRule();ensureLeftStack();defaultPercentMode();markSelectedEntryDestination();},0);return out;}
    wrapped.__v8=true;window.confirmRulesGate=wrapped;
  }

  function patchRenderPortfolio(){
    if(typeof window.renderPortfolio!=='function'||window.renderPortfolio.__v8)return;
    const original=window.renderPortfolio;
    function wrapped(){const out=original.apply(this,arguments);ensureHeaderRule();ensureLeftStack();markSelectedEntryDestination();return out;}
    wrapped.__v8=true;window.renderPortfolio=wrapped;
  }

  function markSelectedEntryDestination(){
    const title=document.getElementById('portfolioTitle');const subtitle=document.getElementById('portfolioSubtitle');const ctx=getCtx();
    if(!title||!subtitle||!ctx)return;
    subtitle.title=`This screen is ${ctx.session}, ${ctx.tier}, entry #${ctx.entry||1}`;
  }

  function run(){hardPauseTutorials();patchRenderPortfolio();patchConfirmRules();ensureHeaderRule();ensureLeftStack();defaultPercentMode();markSelectedEntryDestination();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  setTimeout(run,250);setTimeout(run,1000);
})();
