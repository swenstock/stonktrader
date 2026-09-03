(()=>{
  function loadTradingWorkstation(){
    if(!document.querySelector('link[data-sbc-trading-workstation-v1]')){
      const l=document.createElement('link');l.rel='stylesheet';l.href='/v45-trading-workstation-v1.css?v=20260903a';l.dataset.sbcTradingWorkstationV1='1';document.head.appendChild(l);
    }
    if(!window.__sbcTradingWorkstationV1&&!document.querySelector('script[data-sbc-trading-workstation-v1]')){
      const s=document.createElement('script');s.src='/v45-trading-workstation-v1.js?v=20260903a';s.dataset.sbcTradingWorkstationV1='1';document.head.appendChild(s);
    }
  }
  loadTradingWorkstation();

  const mq=window.matchMedia('(min-width:621px)');
  if(!mq.matches) return;

  const tierOrder=['freeroll','runner','clerk','trader','junior'];
  const art=(key)=>{
    try{ if(typeof TIER_DATA!=='undefined' && TIER_DATA[key]?.art) return TIER_DATA[key].art; }catch(e){}
    return '';
  };

  function addTierIcons(){
    const rows=[...document.querySelectorAll('.mini-tier')];
    rows.forEach((row,i)=>{
      const src=art(tierOrder[i]||'runner');
      if(!src) return;
      let icon=row.querySelector('.desktop-tier-icon');
      if(!icon){icon=document.createElement('img');icon.className='desktop-tier-icon';icon.alt='';icon.setAttribute('aria-hidden','true');row.insertBefore(icon,row.firstChild);}
      if(icon.src!==src)icon.src=src;
    });
  }

  const start=()=>{
    addTierIcons();
    const obs=new MutationObserver(addTierIcons);
    obs.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
