(()=>{
  const mq=window.matchMedia('(max-width:620px)');
  if(!mq.matches) return;

  const art=(key)=>{
    try{
      if(typeof TIER_DATA!=='undefined' && TIER_DATA[key]?.art) return TIER_DATA[key].art;
    }catch(e){}
    const fallback=document.querySelector('.pitch img,.avatar');
    return fallback?.src||'';
  };
  const tierOrder=['freeroll','runner','clerk','trader','junior'];
  const img=(key,cls,alt='StonkBroker')=>{
    const el=document.createElement('img');
    el.className=cls; el.src=art(key); el.alt=alt; return el;
  };

  function cleanEmojiLabel(el){
    if(!el) return;
    el.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)n.textContent=n.textContent.replace(/^[\s🏆📂👑✨🌞🌇📅]+/u,'').trimStart();});
  }

  function statementAnchors(){
    const cards=[...document.querySelectorAll('.statement>div')];
    const keys=['runner','trader','junior'];
    cards.forEach((card,i)=>{
      if(card.querySelector('.mobile-broker-anchor')) return;
      card.insertBefore(img(keys[i]||'runner','mobile-broker-anchor'),card.firstChild);
      cleanEmojiLabel(card.querySelector('b'));
    });
  }

  function setupStepViewer(){
    const wrap=document.querySelector('.steps');
    if(!wrap || wrap.dataset.mobileViewer==='1') return;
    wrap.dataset.mobileViewer='1';
    const steps=[...wrap.children].filter(x=>x.classList.contains('step'));
    const keys=['freeroll','runner','trader','junior'];
    steps.forEach((step,i)=>{
      const num=step.querySelector('.num');
      const h=step.querySelector('h3');
      if(!step.querySelector('.mobile-step-head') && num && h){
        const head=document.createElement('div'); head.className='mobile-step-head';
        head.appendChild(img(keys[i]||'runner','mobile-step-broker'));
        const title=document.createElement('div'); title.className='mobile-step-title';
        title.appendChild(num); title.appendChild(h); head.appendChild(title);
        step.insertBefore(head,step.firstChild);
      }
    });
    let current=0;
    const nav=document.createElement('div'); nav.className='mobile-step-nav';
    const prev=document.createElement('button'); prev.type='button'; prev.setAttribute('aria-label','Previous step'); prev.textContent='‹';
    const dots=document.createElement('div'); dots.className='mobile-step-dots';
    const next=document.createElement('button'); next.type='button'; next.setAttribute('aria-label','Next step'); next.textContent='›';
    nav.append(prev,dots,next); wrap.after(nav);
    steps.forEach((_,i)=>{const d=document.createElement('span'); d.className='mobile-step-dot'; d.onclick=()=>show(i); dots.appendChild(d);});
    function show(i){current=Math.max(0,Math.min(steps.length-1,i)); steps.forEach((s,j)=>s.classList.toggle('mobile-step-active',j===current)); [...dots.children].forEach((d,j)=>d.classList.toggle('active',j===current)); prev.disabled=current===0; next.disabled=current===steps.length-1;}
    prev.onclick=()=>show(current-1); next.onclick=()=>show(current+1); show(0);
  }

  function footerAnchor(){
    const card=document.querySelector('.footer-card');
    if(card && !card.querySelector('.mobile-footer-broker')) card.insertBefore(img('junior','mobile-footer-broker'),card.firstChild);
  }

  function sessionAnchors(){
    document.querySelectorAll('.session').forEach(session=>{
      const holder=session.querySelector('.session-icon');
      if(!holder || holder.querySelector('.mobile-session-broker')) return;
      let key='runner';
      try{ if(typeof currentTierKey!=='undefined' && tierOrder.includes(currentTierKey)) key=currentTierKey; }catch(e){}
      holder.textContent=''; holder.appendChild(img(key,'mobile-session-broker'));
    });
  }

  function contestAnchors(){
    document.querySelectorAll('.mc-card').forEach(card=>{
      const holder=card.querySelector('.mc-icon');
      if(!holder || holder.querySelector('.mobile-contest-broker')) return;
      const t=(card.textContent||'').toUpperCase();
      const key=t.includes('JR.')||t.includes('JUNIOR')?'junior':t.includes('TRADER')?'trader':t.includes('CLERK')?'clerk':t.includes('RUNNER')?'runner':'freeroll';
      holder.textContent=''; holder.appendChild(img(key,'mobile-contest-broker'));
    });
  }

  function headerBroker(){
    const shield=document.querySelector('.shield');
    if(!shield || shield.querySelector('img')) return;
    shield.textContent=''; const i=img('junior',''); i.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:8px;image-rendering:pixelated'; shield.appendChild(i);
  }

  async function syncVisiblePrices(){
    try{
      const r=await fetch('/api/config',{cache:'no-store'}); if(!r.ok)return; const cfg=await r.json();
      const map={
        'FREE ROLL':cfg.tiers?.freeroll?.playerPrice||0,
        'RUNNER':cfg.tiers?.runner?.playerPrice,
        'CLERK':cfg.tiers?.clerk?.playerPrice,
        'TRADER':cfg.tiers?.trader?.playerPrice,
        'JR. STONKBROKER':cfg.tiers?.junior?.playerPrice
      };
      document.querySelectorAll('.mini-tier').forEach(row=>{
        const name=(row.querySelector('b')?.textContent||'').trim().toUpperCase(); const p=map[name]; const s=row.querySelector('span');
        if(s && p!=null) s.textContent=p===0?'FREE':`${Number(p).toLocaleString()} STONK`;
      });
    }catch(e){}
  }

  function enhance(){statementAnchors();setupStepViewer();footerAnchor();sessionAnchors();contestAnchors();headerBroker();}
  const observer=new MutationObserver(()=>{sessionAnchors();contestAnchors();});
  const start=()=>{enhance();syncVisiblePrices();observer.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
