(()=>{
  const mq=window.matchMedia('(max-width:620px)');
  if(!mq.matches) return;

  const tierOrder=['freeroll','runner','clerk','trader','junior'];
  const art=(key)=>{
    try{ if(typeof TIER_DATA!=='undefined' && TIER_DATA[key]?.art) return TIER_DATA[key].art; }catch(e){}
    const fallback=document.querySelector('.pitch img,.avatar');
    return fallback?.src||'';
  };
  const img=(key,cls,alt='StonkBroker')=>{const el=document.createElement('img');el.className=cls;el.src=art(key);el.alt=alt;return el;};
  const cleanEmojiLabel=(el)=>{if(!el)return;el.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE)n.textContent=n.textContent.replace(/^[\s🏆📂👑✨🌞🌇📅]+/u,'').trimStart();});};

  function compactPath(){
    const box=document.querySelector('.statement');
    if(!box||box.dataset.mobileV3==='1')return;
    box.dataset.mobileV3='1';
    const rows=[
      ['runner','EARN A TICKET','Finish in the money.'],
      ['trader','PLAY • HOLD • SELL','Use your ticket or trade it.'],
      ['junior','WIN THE STONKBROKER','Main Event champion takes it.']
    ];
    box.innerHTML='';
    rows.forEach(([key,title,copy])=>{
      const row=document.createElement('div');row.className='mobile-path-row';
      row.appendChild(img(key,'mobile-broker-anchor'));
      const text=document.createElement('div');text.innerHTML=`<b>${title}</b><span>${copy}</span>`;row.appendChild(text);box.appendChild(row);
    });
  }

  function setupStepViewer(){
    const wrap=document.querySelector('.steps');
    if(!wrap||wrap.dataset.mobileV3==='1')return;
    wrap.dataset.mobileV3='1';
    const steps=[...wrap.children].filter(x=>x.classList.contains('step'));
    const keys=['freeroll','runner','trader','junior'];
    const titles=['ENTER THE TRADING FLOOR','PICK YOUR FORMAT','EARN YOUR TICKET','WIN THE STONKBROKER'];
    const copies=['Pick a tier. Pick a session. Trade.','Weekly, daily, morning, afternoon or Degen.','Finish near the top. Play, hold or sell what you win.','Win or buy a Main Event ticket. Finish #1.'];

    steps.forEach((step,i)=>{
      const num=step.querySelector('.num');const h=step.querySelector('h3');
      if(h)h.textContent=titles[i]||h.textContent;
      const ps=[...step.querySelectorAll(':scope>p')];
      if(ps[0])ps[0].textContent=copies[i]||ps[0].textContent;
      ps.slice(1).forEach(p=>p.remove());
      if(num&&h&&!step.querySelector('.mobile-step-head')){
        const head=document.createElement('div');head.className='mobile-step-head';head.appendChild(img(keys[i]||'runner','mobile-step-broker'));
        const title=document.createElement('div');title.className='mobile-step-title';title.appendChild(num);title.appendChild(h);head.appendChild(title);step.insertBefore(head,step.firstChild);
      }
    });

    document.querySelectorAll('.mini-tier').forEach((row,i)=>{
      if(row.querySelector('.mobile-tier-thumb'))return;
      const key=tierOrder[i]||'runner';row.insertBefore(img(key,'mobile-tier-thumb'),row.firstChild);
    });

    let current=0;
    const nav=document.createElement('div');nav.className='mobile-step-nav';
    const prev=document.createElement('button');prev.type='button';prev.setAttribute('aria-label','Previous step');prev.textContent='‹';
    const dots=document.createElement('div');dots.className='mobile-step-dots';
    const next=document.createElement('button');next.type='button';next.setAttribute('aria-label','Next step');next.textContent='›';
    nav.append(prev,dots,next);wrap.after(nav);
    steps.forEach((_,i)=>{const d=document.createElement('span');d.className='mobile-step-dot';d.onclick=()=>show(i);dots.appendChild(d);});
    function show(i){current=Math.max(0,Math.min(steps.length-1,i));steps.forEach((s,j)=>s.classList.toggle('mobile-step-active',j===current));[...dots.children].forEach((d,j)=>d.classList.toggle('active',j===current));prev.disabled=current===0;next.disabled=current===steps.length-1;}
    prev.onclick=()=>show(current-1);next.onclick=()=>show(current+1);show(0);
  }

  function footerAnchor(){
    const card=document.querySelector('.footer-card');if(!card)return;
    if(!card.querySelector('.mobile-footer-broker'))card.insertBefore(img('junior','mobile-footer-broker'),card.firstChild);
    const strong=card.querySelector('strong');const span=card.querySelector('span');
    if(strong)strong.textContent='MAIN EVENT = THE DESTINATION';
    if(span)span.textContent='Earn or buy a ticket. Finish #1.';
  }

  function sessionAnchors(){document.querySelectorAll('.session').forEach(session=>{const holder=session.querySelector('.session-icon');if(!holder||holder.querySelector('.mobile-session-broker'))return;let key='runner';try{if(typeof currentTierKey!=='undefined'&&tierOrder.includes(currentTierKey))key=currentTierKey;}catch(e){}holder.textContent='';holder.appendChild(img(key,'mobile-session-broker'));});}
  function contestAnchors(){document.querySelectorAll('.mc-card').forEach(card=>{const holder=card.querySelector('.mc-icon');if(!holder||holder.querySelector('.mobile-contest-broker'))return;const t=(card.textContent||'').toUpperCase();const key=t.includes('JR.')||t.includes('JUNIOR')?'junior':t.includes('TRADER')?'trader':t.includes('CLERK')?'clerk':t.includes('RUNNER')?'runner':'freeroll';holder.textContent='';holder.appendChild(img(key,'mobile-contest-broker'));});}
  function headerBroker(){const shield=document.querySelector('.shield');if(!shield||shield.querySelector('img'))return;shield.textContent='';const i=img('junior','');i.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:8px;image-rendering:pixelated';shield.appendChild(i);}

  async function syncVisiblePrices(){
    try{
      const r=await fetch('/api/config',{cache:'no-store'});if(!r.ok)return;const cfg=await r.json();
      const map={'FREE ROLL':cfg.tiers?.freeroll?.playerPrice||0,'RUNNER':cfg.tiers?.runner?.playerPrice,'CLERK':cfg.tiers?.clerk?.playerPrice,'TRADER':cfg.tiers?.trader?.playerPrice,'JR. STONKBROKER':cfg.tiers?.junior?.playerPrice};
      document.querySelectorAll('.mini-tier').forEach(row=>{const name=(row.querySelector('b')?.textContent||'').trim().toUpperCase();const p=map[name];const s=row.querySelector('span');if(s&&p!=null)s.textContent=p===0?'FREE':`${Number(p).toLocaleString()} STONK`;});
    }catch(e){}
  }

  function tightenLabels(){
    document.querySelectorAll('.action').forEach(a=>{const t=(a.textContent||'').toUpperCase();if(t.includes('TRADING FLOOR')){const small=a.querySelector('small');if(small)small.textContent='Choose tier • session • trade';}if(t.includes('TICKET EXCHANGE')){const small=a.querySelector('small');if(small)small.textContent='Buy or sell tickets';}});
  }

  function enhance(){compactPath();setupStepViewer();footerAnchor();sessionAnchors();contestAnchors();headerBroker();tightenLabels();}
  const observer=new MutationObserver(()=>{sessionAnchors();contestAnchors();});
  const start=()=>{enhance();syncVisiblePrices();observer.observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
