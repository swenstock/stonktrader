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

  function tierName(){
    const ctx=getCtx();
    const title=(document.getElementById('portfolioTitle')?.textContent||'').trim();
    const fromTitle=(title.split(/—|-/).pop()||'').trim();
    const raw=String(ctx?.tierName||ctx?.tierLabel||ctx?.tier||ctx?.tierId||fromTitle||'').trim();
    return raw.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function copyVisualFrom(source,holder){
    if(!source||!holder)return false;
    const img=source.matches?.('img')?source:source.querySelector?.('img');
    if(img?.src){
      const clone=img.cloneNode(true);clone.removeAttribute('width');clone.removeAttribute('height');clone.className='tier-broker-title-img';clone.alt=`${tierName()} tier broker`;
      holder.replaceChildren(clone);return true;
    }
    const svg=source.matches?.('svg')?source:source.querySelector?.('svg');
    if(svg){const clone=svg.cloneNode(true);clone.classList.add('tier-broker-title-svg');holder.replaceChildren(clone);return true;}
    const candidates=[source,...(source.querySelectorAll?.('*')||[])];
    for(const el of candidates){
      const bg=getComputedStyle(el).backgroundImage;
      if(bg&&bg!=='none'&&/url\(/i.test(bg)){
        holder.replaceChildren();holder.style.backgroundImage=bg;holder.style.backgroundSize='cover';holder.style.backgroundPosition='center';holder.style.backgroundRepeat='no-repeat';return true;
      }
    }
    return false;
  }

  function ensureTierBrokerArt(){
    const title=document.getElementById('portfolioTitle');
    const row=title?.closest('.trade-head-title-row');
    if(!title||!row)return;
    const tier=tierName();if(!tier)return;
    let holder=row.querySelector('.tier-broker-title-art');
    if(!holder){holder=document.createElement('span');holder.className='tier-broker-title-art';row.insertBefore(holder,title);}
    if(holder.dataset.tier===tier&&holder.childNodes.length)return;
    holder.dataset.tier=tier;holder.replaceChildren();holder.style.backgroundImage='';
    const needle=tier.toLowerCase();
    const selectors=['[data-tier]','[data-tier-id]','[class*="tier"]','[class*="contest"]','[class*="room"]','[class*="card"]'];
    const all=[...document.querySelectorAll(selectors.join(','))].filter(el=>!el.closest('#view-portfolio'));
    const ranked=all.filter(el=>{
      const d=String(el.dataset?.tier||el.dataset?.tierId||'').toLowerCase().replace(/[_-]+/g,' ');
      const text=(el.textContent||'').toLowerCase();
      return d.includes(needle)||text.includes(needle);
    });
    for(const candidate of ranked){if(copyVisualFrom(candidate,holder))return;}
    const anyImg=[...document.images].find(img=>{
      if(img.closest('#view-portfolio'))return false;
      const hay=`${img.alt||''} ${img.title||''} ${img.src||''}`.toLowerCase().replace(/[_-]+/g,' ');
      return hay.includes(needle);
    });
    if(anyImg&&copyVisualFrom(anyImg,holder))return;
    holder.classList.add('tier-broker-title-art-fallback');
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
    ensureTierBrokerArt();
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

  function markUserSizingIntent(){
    document.querySelectorAll('.quick-input-mode button').forEach(btn=>{
      if(btn.dataset.v9ModeBound)return;
      btn.dataset.v9ModeBound='1';
      btn.addEventListener('click',()=>{document.body.dataset.tradeSizingChosen='1';});
    });
  }

  function setPercentVisualState(){
    const buttons=[...document.querySelectorAll('.quick-input-mode button')];
    if(!buttons.length)return;
    const percent=buttons.find(b=>/percent/i.test(b.textContent));
    const shares=buttons.find(b=>/share/i.test(b.textContent));
    if(percent){percent.classList.add('trade-mode-default-percent');percent.setAttribute('aria-pressed','true');}
    if(shares){shares.classList.remove('trade-mode-default-percent');shares.setAttribute('aria-pressed','false');}
  }

  function defaultPercentMode(force=false){
    const ctx=getCtx();if(!ctx)return;
    const key=[ctx.session,ctx.tier,ctx.entry,ctx.mode].join('|');
    if(document.body.dataset.percentDefaultContext!==key){
      document.body.dataset.percentDefaultContext=key;
      delete document.body.dataset.tradeSizingChosen;
    }
    markUserSizingIntent();
    if(document.body.dataset.tradeSizingChosen==='1'&&!force)return;
    try{
      if(typeof setTradeInputMode==='function')setTradeInputMode('percent');
      const btn=[...document.querySelectorAll('.quick-percent-row button')].find(b=>b.textContent.trim()==='50%');
      if(btn&&typeof selectQuickPercent==='function')selectQuickPercent(50,btn);
      setPercentVisualState();
    }catch(e){}
  }

  function compactSymbolLookup(){
    const card=document.querySelector('#view-portfolio .chart-trade-card');
    const search=card?.querySelector('.trade-search-row');
    const head=card?.querySelector('.card-head');
    if(!card||!search||!head)return;
    search.classList.add('trade-search-inline');
    head.classList.add('trade-card-head-v9');
    if(search.parentElement!==head)head.appendChild(search);
    const select=search.querySelector('select');
    if(select)select.setAttribute('aria-label','Trade symbol');
  }

  function polishActivityRows(){
    const history=document.getElementById('tradeHistory');
    if(!history)return;
    [...history.children].forEach(row=>{
      if(row.querySelector?.('.activity-detail-v9'))return;
      const raw=(row.textContent||'').replace(/\s+/g,' ').trim();
      const m=raw.match(/\b(BUY|SELL)\b\s+([A-Z][A-Z0-9.]{0,7}).*?([\d,.]+)\s*(?:sh|shares?)\s*@\s*\$?([\d,.]+)/i);
      if(!m)return;
      const side=m[1].toUpperCase(),symbol=m[2].toUpperCase();
      const qty=Number(m[3].replace(/,/g,'')),price=Number(m[4].replace(/,/g,''));
      if(!Number.isFinite(qty)||!Number.isFinite(price))return;
      const detail=document.createElement('div');detail.className='activity-detail-v9';
      const notional=qty*price;
      detail.innerHTML=`<span>${qty.toLocaleString(undefined,{maximumFractionDigits:4})} SHARES</span><span>@ $${price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span>$${notional.toLocaleString(undefined,{maximumFractionDigits:0})} NOTIONAL</span>`;
      detail.dataset.side=side;detail.dataset.symbol=symbol;
      row.appendChild(detail);
      row.classList.add('activity-row-v9');
    });
  }

  function watchDynamicTradeUi(){
    if(document.body.dataset.tradeUiObserverV9)return;
    document.body.dataset.tradeUiObserverV9='1';
    let timer=null;
    const observer=new MutationObserver(()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>{
        ensureTierBrokerArt();
        compactSymbolLookup();
        polishActivityRows();
        markUserSizingIntent();
        defaultPercentMode(false);
      },40);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function patchConfirmRules(){
    if(typeof window.confirmRulesGate!=='function'||window.confirmRulesGate.__v10)return;
    const original=window.confirmRulesGate;
    function wrapped(){const out=original.apply(this,arguments);setTimeout(()=>{hardPauseTutorials();ensureHeaderRule();ensureLeftStack();compactSymbolLookup();polishActivityRows();defaultPercentMode(true);markSelectedEntryDestination();},0);setTimeout(()=>defaultPercentMode(false),120);setTimeout(()=>defaultPercentMode(false),500);return out;}
    wrapped.__v10=true;window.confirmRulesGate=wrapped;
  }

  function patchRenderPortfolio(){
    if(typeof window.renderPortfolio!=='function'||window.renderPortfolio.__v10)return;
    const original=window.renderPortfolio;
    function wrapped(){const out=original.apply(this,arguments);ensureHeaderRule();ensureLeftStack();compactSymbolLookup();polishActivityRows();markSelectedEntryDestination();setTimeout(()=>{ensureTierBrokerArt();defaultPercentMode(false);},0);setTimeout(()=>defaultPercentMode(false),120);return out;}
    wrapped.__v10=true;window.renderPortfolio=wrapped;
  }

  function markSelectedEntryDestination(){
    const title=document.getElementById('portfolioTitle');const subtitle=document.getElementById('portfolioSubtitle');const ctx=getCtx();
    if(!title||!subtitle||!ctx)return;
    subtitle.title=`This screen is ${ctx.session}, ${ctx.tier}, entry #${ctx.entry||1}`;
  }

  function run(){hardPauseTutorials();patchRenderPortfolio();patchConfirmRules();ensureHeaderRule();ensureLeftStack();compactSymbolLookup();polishActivityRows();defaultPercentMode(false);markUserSizingIntent();markSelectedEntryDestination();watchDynamicTradeUi();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  setTimeout(run,250);setTimeout(run,1000);setTimeout(()=>{ensureTierBrokerArt();defaultPercentMode(false);},1600);
})();
