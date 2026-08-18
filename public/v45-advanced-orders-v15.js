(()=>{
  'use strict';
  if(window.__sbcAdvancedOrdersV15)return;
  window.__sbcAdvancedOrdersV15=true;
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];

  function token(){
    const direct=['token','authToken','sbcToken','sessionToken'].map(k=>localStorage.getItem(k)).find(Boolean);
    if(direct)return direct;
    for(let i=0;i<localStorage.length;i++){
      const v=localStorage.getItem(localStorage.key(i))||'';
      if(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v))return v;
    }
    return '';
  }
  async function api(path,opts={}){
    const t=token();
    const r=await fetch(`/api${path}`,{...opts,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})}});
    const out=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(out.error||`Request failed (${r.status})`);
    return out;
  }
  function ctx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null;}catch(_){return null;}}
  function p(){try{return typeof currentPortfolio==='function'?currentPortfolio():null;}catch(_){return null;}}
  function portfolioId(){const x=p(),c=ctx();return Number(x?.id||x?.portfolioId||c?.portfolioId||c?.portfolio_id||window.activePortfolioId||0)||null;}
  function symbolFor(){return String($('#view-portfolio .trade-search-row select,#view-portfolio select')?.value||'').trim().toUpperCase();}

  function setType(ticket,type){
    ticket.dataset.advType=type;
    $$('[data-adv-type]',ticket).forEach(b=>b.classList.toggle('active',b.dataset.advType===type));
    const limit=$('.adv-limit-v15',ticket),stop=$('.adv-stop-v15',ticket);
    if(limit)limit.hidden=!['limit','stop_limit'].includes(type);
    if(stop)stop.hidden=!['stop','stop_limit'].includes(type);
  }
  function ensureControls(){
    const ticket=$('#view-portfolio .quick-trade-clean');
    if(!ticket||$('.advanced-order-types-v15',ticket))return;
    const anchor=$('.quick-input-mode',ticket);
    if(!anchor)return;
    ticket.dataset.advType='market';
    ticket.dataset.advMode='percent';
    ticket.dataset.advPercent='50';
    const wrap=document.createElement('div');
    wrap.className='advanced-order-types-v15';
    wrap.innerHTML=`<div class="adv-type-row-v15"><span>ORDER TYPE</span><button type="button" data-adv-type="market" class="active">MARKET</button><button type="button" data-adv-type="limit">LIMIT</button><button type="button" data-adv-type="stop">STOP</button><button type="button" data-adv-type="stop_limit">STOP LIMIT</button></div><div class="adv-price-row-v15"><label class="adv-limit-v15" hidden>LIMIT $ <input type="number" inputmode="decimal" min="0" step="0.01" class="adv-limit-price-v15" placeholder="0.00"></label><label class="adv-stop-v15" hidden>STOP $ <input type="number" inputmode="decimal" min="0" step="0.01" class="adv-stop-price-v15" placeholder="0.00"></label></div>`;
    anchor.parentElement.insertBefore(wrap,anchor);
    $$('[data-adv-type]',wrap).forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setType(ticket,b.dataset.advType);}));
    $$('.quick-input-mode button',ticket).forEach(b=>b.addEventListener('click',()=>{ticket.dataset.advMode=/share/i.test(b.textContent||'')?'shares':'percent';}));
    $$('.quick-percent-row button',ticket).forEach(b=>b.addEventListener('click',()=>{const n=Number(((b.textContent||'').match(/\d+/)||[])[0]);if(n)ticket.dataset.advPercent=String(n);}));
    ticket.addEventListener('click',interceptAdvanced,true);
  }
  function quantityFor(ticket){
    const inputs=$$('input[type="number"]',ticket).filter(x=>!x.classList.contains('adv-limit-price-v15')&&!x.classList.contains('adv-stop-price-v15'));
    const visible=inputs.find(x=>!x.hidden&&x.offsetParent!==null)||inputs[0];
    return Number(visible?.value||0);
  }
  async function interceptAdvanced(e){
    const btn=e.target.closest('.quick-action');
    if(!btn)return;
    const ticket=e.currentTarget;
    const type=ticket.dataset.advType||'market';
    if(type==='market')return; // proven Stage 2 path handles ordinary market orders
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const pid=portfolioId(),symbol=symbolFor(),side=/sell/i.test(btn.textContent||'')?'sell':'buy';
    if(!pid)return alert('This portfolio could not be identified. Refresh the page and try again.');
    if(!symbol)return alert('Choose a stock before placing the order.');
    const body={portfolioId:pid,symbol,side,orderType:type};
    if((ticket.dataset.advMode||'percent')==='shares')body.quantity=quantityFor(ticket);
    else body.percent=Number(ticket.dataset.advPercent||50);
    if(['limit','stop_limit'].includes(type))body.limitPrice=Number($('.adv-limit-price-v15',ticket)?.value||0);
    if(['stop','stop_limit'].includes(type))body.stopPrice=Number($('.adv-stop-price-v15',ticket)?.value||0);
    const old=btn.textContent;btn.disabled=true;btn.textContent='SENDING…';
    try{
      const out=await api('/advanced-orders-v15',{method:'POST',body:JSON.stringify(body)});
      alert(out.message||'Advanced order accepted.');
      refreshOrders();
    }catch(err){alert(err.message);}
    finally{btn.disabled=false;btn.textContent=old;}
  }

  async function refreshOrders(){
    const pid=portfolioId(),box=$('#queuedOrders');
    if(!pid||!box||!token())return;
    let rows;try{rows=await api('/advanced-orders-v15');}catch(_){return;}
    rows=rows.filter(r=>Number(r.portfolioId)===pid&&r.status==='pending');
    $$('.advanced-order-row-v15',box).forEach(x=>x.remove());
    const empty=[...box.children].find(x=>/no queued orders/i.test(x.textContent||''));
    if(!rows.length){if(empty)empty.style.display='';return;}
    if(empty)empty.style.display='none';
    rows.forEach(r=>{
      const type=String(r.orderType||'').replace('_',' ').toUpperCase();
      const trigger=r.orderType==='limit'?`Limit $${Number(r.limitPrice).toFixed(2)}`:r.orderType==='stop'?`Stop $${Number(r.stopPrice).toFixed(2)}`:`Stop $${Number(r.stopPrice).toFixed(2)} → Limit $${Number(r.limitPrice).toFixed(2)}`;
      const size=r.percent?`${r.percent}% sizing`:`${Number(r.quantity||0).toLocaleString()} shares`;
      const div=document.createElement('div');div.className='advanced-order-row-v15';
      div.innerHTML=`<div><b>${String(r.side).toUpperCase()} ${r.symbol}</b><span>${type} • ${size} • ${trigger}${r.triggeredAt?' • STOP TRIGGERED':''}</span></div><button type="button" data-cancel-adv-v15="${r.id}">CANCEL</button>`;
      box.appendChild(div);
    });
    $$('[data-cancel-adv-v15]',box).forEach(b=>b.onclick=async()=>{try{await api(`/advanced-orders-v15/${b.dataset.cancelAdvV15}`,{method:'DELETE'});refreshOrders();}catch(e){alert(e.message);}});
  }
  function run(){ensureControls();refreshOrders();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  setTimeout(run,400);setTimeout(run,1400);setInterval(run,5000);
})();
