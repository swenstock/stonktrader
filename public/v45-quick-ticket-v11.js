(()=>{
  'use strict';
  const MIN=10,MAX=100;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  let modal=null,state={count:10,rows:[],review:null,step:'edit'};

  function currentP(){try{return typeof currentPortfolio==='function'?currentPortfolio():null;}catch(e){return null;}}
  function currentCtx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null;}catch(e){return null;}}
  function authHeaders(){const token=localStorage.getItem('token')||'';return {'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})};}
  async function api(path,opts={}){const r=await fetch(`/api${path}`,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||`Request failed (${r.status})`);return out;}
  function money(n){return `$${Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0})}`;}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function portfolioId(){const p=currentP(),c=currentCtx();return Number(p?.id||p?.portfolioId||c?.portfolioId||c?.portfolio_id||window.activePortfolioId||0)||null;}
  function isMarketClosedMessage(msg){return /US equity trading is closed|resumes at the next regular-market|resumes at the next regular-market open/i.test(String(msg||''));}

  function ensureLaunchButton(){
    const ticket=document.querySelector('#view-portfolio .quick-trade-clean');
    const head=ticket?.querySelector('.quick-trade-head');
    if(!ticket||!head||head.querySelector('.quick-ticket-launch'))return;
    const btn=document.createElement('button');btn.type='button';btn.className='quick-ticket-launch';btn.innerHTML='<span>⚡</span> CREATE A BASKET';
    btn.title='Build an equal-weight basket of 10 or more stocks';btn.onclick=()=>openCountPrompt();head.appendChild(btn);
  }

  function ensureModal(){
    if(modal)return modal;
    modal=document.createElement('div');modal.className='qt-overlay';modal.hidden=true;
    modal.innerHTML=`<div class="qt-modal" role="dialog" aria-modal="true" aria-labelledby="qtTitle">
      <header class="qt-head"><div><small>FAST PORTFOLIO BUILDER</small><h2 id="qtTitle">⚡ CREATE A BASKET — EQUAL WEIGHT PORTFOLIO</h2><p>Build a basket fast. Every selected stock receives the same target weight.</p></div><div class="qt-head-actions"><button type="button" id="qtLoad">LOAD LIST</button><button type="button" id="qtSave">SAVE LIST</button><button type="button" class="qt-x" id="qtClose">×</button></div></header>
      <div id="qtBody"></div>
    </div>`;
    document.body.appendChild(modal);
    $('#qtClose',modal).onclick=close;
    $('#qtLoad',modal).onclick=showSavedLists;
    $('#qtSave',modal).onclick=saveCurrentList;
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    return modal;
  }

  function openCountPrompt(){
    ensureModal();state={count:10,rows:[],review:null,step:'count'};modal.hidden=false;
    $('#qtSave',modal).disabled=true;
    $('#qtBody',modal).innerHTML=`<section class="qt-count-step"><div class="qt-step-num">1</div><div><h3>How many stocks will you be buying?</h3><p>Minimum ${MIN}. Create A Basket equal-weights them automatically.</p></div><input id="qtCount" type="number" min="${MIN}" max="${MAX}" value="10"><button id="qtBuild" type="button">BUILD BASKET</button></section>`;
    $('#qtBuild',modal).onclick=()=>{const n=Math.floor(Number($('#qtCount',modal).value));if(!Number.isFinite(n)||n<MIN||n>MAX)return alert(`Enter between ${MIN} and ${MAX} stocks.`);buildRows(n);};
    $('#qtCount',modal).addEventListener('keydown',e=>{if(e.key==='Enter')$('#qtBuild',modal).click();});
    setTimeout(()=>$('#qtCount',modal)?.select(),0);
  }

  function buildRows(n,symbols=[]){
    state.count=n;state.rows=Array.from({length:n},(_,i)=>({symbol:String(symbols[i]||'').toUpperCase(),name:'',price:null}));state.step='edit';state.review=null;
    renderEditor();
  }

  function renderEditor(){
    const weight=100/state.count;
    const p=currentP();const total=Number(p?.value||p?.totalValue||100000);const est=total/state.count;
    $('#qtSave',modal).disabled=false;
    $('#qtBody',modal).innerHTML=`<section class="qt-editor">
      <div class="qt-editor-top"><div class="qt-step-num">2</div><div><h3>Enter ${state.count} stock symbols</h3><p>Equal weight: <b>${weight.toFixed(2)}% each</b>. Company names and prices verify automatically before review.</p></div><div class="qt-allocation">TOTAL ALLOCATION <b>100%</b></div></div>
      <div class="qt-table-head"><span>#</span><span>SYMBOL</span><span>COMPANY / STATUS</span><span>WEIGHT</span><span>EST. $</span></div>
      <div class="qt-rows" id="qtRows">${state.rows.map((r,i)=>rowHtml(r,i,weight,est)).join('')}</div>
      <div class="qt-editor-foot"><button type="button" class="ghost" id="qtBackCount">CHANGE COUNT</button><span>Equal-weight target • Server rules still apply</span><button type="button" class="primary" id="qtReview">REVIEW BASKET →</button></div>
    </section>`;
    $$('.qt-symbol',modal).forEach(inp=>{inp.addEventListener('input',()=>{const i=Number(inp.dataset.i);state.rows[i].symbol=inp.value.trim().toUpperCase();inp.value=state.rows[i].symbol;state.rows[i].name='';state.rows[i].price=null;});inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const next=$(`.qt-symbol[data-i="${Number(inp.dataset.i)+1}"]`,modal);next?.focus();}});});
    $('#qtBackCount',modal).onclick=openCountPrompt;$('#qtReview',modal).onclick=review;
    setTimeout(()=>$('.qt-symbol',modal)?.focus(),0);
  }

  function rowHtml(r,i,weight,est){return `<div class="qt-row"><span class="qt-num">${i+1}</span><input class="qt-symbol" data-i="${i}" maxlength="8" placeholder="e.g. AAPL" value="${esc(r.symbol)}"><span class="qt-company">${esc(r.name||'Waiting for symbol')}</span><span class="qt-weight">${weight.toFixed(2)}%</span><span class="qt-est">${money(est)}</span></div>`;}

  async function validateRows(){
    const symbols=state.rows.map(r=>r.symbol.trim().toUpperCase());
    if(symbols.some(s=>!s))throw new Error('Fill every stock row before reviewing.');
    const unique=new Set(symbols);if(unique.size!==symbols.length)throw new Error('Each stock may appear only once in a basket.');
    const preview=await api('/quick-tickets/preview',{method:'POST',body:JSON.stringify({symbols})});
    state.rows=preview.rows.map(r=>({symbol:r.symbol,name:r.name||'',price:Number(r.price)}));return preview;
  }

  async function review(){
    const btn=$('#qtReview',modal);btn.disabled=true;btn.textContent='CHECKING SYMBOLS…';
    try{
      const preview=await validateRows();
      const pid=portfolioId();if(!pid)throw new Error('I could not resolve this portfolio ID. Refresh the portfolio and try again.');
      const portfolio=await api(`/portfolios/${pid}`);
      const queueMode=!portfolio.tradingAllowed&&isMarketClosedMessage(portfolio.tradingMessage);
      if(!portfolio.tradingAllowed&&!queueMode)throw new Error(portfolio.tradingMessage||'Trading is currently closed.');
      const target=Number(portfolio.totalValue)/preview.count;
      const positions=new Map((portfolio.positions||[]).map(x=>[String(x.symbol).toUpperCase(),x]));
      let desired=preview.rows.map(r=>{const pos=positions.get(r.symbol);const current=Number(pos?.value||0);return {...r,current,target,rawSpend:Math.max(0,target-current)};});
      const rawTotal=desired.reduce((s,r)=>s+r.rawSpend,0),cash=Number(portfolio.cash||0),scale=rawTotal>cash&&rawTotal>0?cash/rawTotal:1;
      desired=desired.map(r=>({...r,spend:r.rawSpend*scale,quantity:r.price>0?(r.rawSpend*scale)/r.price:0}));
      state.review={portfolio,rows:desired,weight:preview.weight,scale,totalSpend:desired.reduce((s,r)=>s+r.spend,0),queueMode};state.step='review';renderReview();
    }catch(e){alert(e.message);renderEditor();}
  }

  function renderReview(){
    const rv=state.review;$('#qtSave',modal).disabled=false;
    $('#qtBody',modal).innerHTML=`<section class="qt-review"><div class="qt-editor-top"><div class="qt-step-num">3</div><div><h3>Review Basket</h3><p>${rv.rows.length} stocks • ${rv.weight.toFixed(2)}% target weight each • ${money(rv.totalSpend)} estimated new buys</p></div><div class="qt-allocation">AVAILABLE CASH <b>${money(rv.portfolio.cash)}</b></div></div>
      ${rv.queueMode?'<div class="qt-warning">The market is currently closed. If you submit this basket, the orders will go into the queue and be re-priced and rechecked at the next eligible market open.</div>':''}
      ${rv.scale<.999?'<div class="qt-warning">Your current holdings leave less cash than the full equal-weight target. New purchases were scaled proportionally to available cash; existing positions will not be sold.</div>':''}
      <div class="qt-review-list">${rv.rows.map((r,i)=>`<div><span>${i+1}</span><b>${esc(r.symbol)}</b><small>${esc(r.name)}</small><em>${rv.weight.toFixed(2)}%</em><strong>${r.spend>.01?money(r.spend):'NO BUY NEEDED'}</strong></div>`).join('')}</div>
      <footer class="qt-submit-foot"><button type="button" class="ghost" id="qtEdit">← EDIT BASKET</button><div><small>${rv.queueMode?'Orders will queue for the next eligible market open.':'Orders execute at the current simulated market quote.'} SBC rules are rechecked at execution.</small><b>${rv.rows.filter(r=>r.spend>.01).length} BUY ORDERS</b></div><button type="button" class="primary" id="qtSubmit">${rv.queueMode?'QUEUE BASKET':'SUBMIT BASKET'}</button></footer></section>`;
    $('#qtEdit',modal).onclick=renderEditor;$('#qtSubmit',modal).onclick=submitBasket;
  }

  async function submitBasket(){
    const btn=$('#qtSubmit',modal);btn.disabled=true;const pid=portfolioId();const buys=state.review.rows.filter(r=>r.spend>.01&&r.quantity>0);
    let completed=0,queued=0,executed=0;
    try{
      for(const r of buys){
        btn.textContent=`SENDING ${completed+1} OF ${buys.length}…`;
        const result=await api(`/portfolios/${pid}/trades`,{method:'POST',body:JSON.stringify({symbol:r.symbol,side:'buy',quantity:r.quantity,targetPortfolioPct:state.review.weight,basketOrder:true})});
        if(result?.queued)queued++;else executed++;
        completed++;
      }
      if(queued===buys.length){
        $('#qtBody',modal).innerHTML=`<section class="qt-success"><div>✓</div><h3>BASKET QUEUED</h3><p>The market is currently closed. Your ${queued} basket orders are in the queue and will be re-priced and rechecked at the next eligible market open.</p><button type="button" id="qtDone">RETURN TO PORTFOLIO</button></section>`;
      }else if(queued>0){
        $('#qtBody',modal).innerHTML=`<section class="qt-success"><div>✓</div><h3>BASKET SUBMITTED</h3><p>${executed} orders executed and ${queued} orders were queued for the next eligible market open.</p><button type="button" id="qtDone">RETURN TO PORTFOLIO</button></section>`;
      }else{
        $('#qtBody',modal).innerHTML=`<section class="qt-success"><div>✓</div><h3>BASKET COMPLETE</h3><p>${executed} equal-weight buy orders were executed.</p><button type="button" id="qtDone">RETURN TO PORTFOLIO</button></section>`;
      }
      $('#qtDone',modal).onclick=()=>location.reload();
      if(!queued)setTimeout(()=>location.reload(),1400);
    }catch(e){
      $('#qtBody',modal).innerHTML=`<section class="qt-success qt-partial"><div>!</div><h3>BASKET STOPPED</h3><p>${executed} executed and ${queued} queued before the server rejected the next order.<br>${esc(e.message)}</p><button type="button" id="qtDone">REFRESH PORTFOLIO</button></section>`;
      $('#qtDone',modal).onclick=()=>location.reload();
    }
  }

  async function saveCurrentList(){
    if(state.step==='count')return;
    try{await validateRows();}catch(e){return alert(e.message);}
    const name=prompt('Name this saved basket list:');if(!name?.trim())return;
    try{await api('/quick-tickets/lists',{method:'POST',body:JSON.stringify({name:name.trim(),symbols:state.rows.map(r=>r.symbol)})});alert(`Saved “${name.trim()}” with ${state.rows.length} stocks.`);}catch(e){alert(e.message);}
  }

  async function showSavedLists(){
    try{
      const lists=await api('/quick-tickets/lists');
      $('#qtSave',modal).disabled=true;state.step='saved';
      $('#qtBody',modal).innerHTML=`<section class="qt-saved"><div class="qt-editor-top"><div class="qt-step-num">★</div><div><h3>Saved Basket Lists</h3><p>Load a basket and its equal weights will be recalculated for this portfolio.</p></div></div><div class="qt-saved-list">${lists.length?lists.map(x=>`<div class="qt-saved-row"><button class="qt-load-list" data-id="${x.id}"><b>${esc(x.name)}</b><span>${x.symbols.length} stocks • ${x.symbols.slice(0,5).join(', ')}${x.symbols.length>5?'…':''}</span></button><button class="qt-delete-list" data-id="${x.id}" title="Delete saved list">DELETE</button></div>`).join(''):'<div class="qt-empty">No saved basket lists yet.</div>'}</div><footer class="qt-editor-foot"><button type="button" class="ghost" id="qtNewList">+ NEW BASKET</button></footer></section>`;
      $$('.qt-load-list',modal).forEach(b=>b.onclick=()=>{const x=lists.find(v=>String(v.id)===b.dataset.id);if(x)buildRows(x.symbols.length,x.symbols);});
      $$('.qt-delete-list',modal).forEach(b=>b.onclick=async()=>{const x=lists.find(v=>String(v.id)===b.dataset.id);if(!x||!confirm(`Delete “${x.name}”?`))return;await api(`/quick-tickets/lists/${x.id}`,{method:'DELETE'});showSavedLists();});
      $('#qtNewList',modal).onclick=openCountPrompt;
    }catch(e){alert(e.message);}
  }

  function close(){if(modal)modal.hidden=true;}
  function run(){ensureLaunchButton();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  const obs=new MutationObserver(()=>run());obs.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(run,350);setTimeout(run,1200);
})();
