(()=>{
  const tierOrder=['freeroll','runner','clerk','trader','junior'];
  const art=(key)=>{
    try{ if(typeof TIER_DATA!=='undefined' && TIER_DATA[key]?.art) return TIER_DATA[key].art; }catch(e){}
    return '';
  };

  function syncFloorTierArt(){
    tierOrder.forEach((key)=>{
      const card=document.getElementById(`cleanCard-${key}`);
      if(!card) return;
      const img=card.querySelector('img');
      const src=art(key);
      if(img && src && img.src!==src) img.src=src;
      if(key==='junior'){
        const title=card.querySelector('h3');
        if(title && title.textContent.trim().replace(/\s+/g,' ')!=='JR. BROKER') title.innerHTML='JR.<br>BROKER';
      }
    });
  }

  function addTierIcons(){
    if(!window.matchMedia('(min-width:621px)').matches) return;
    const rows=[...document.querySelectorAll('.mini-tier')];
    rows.forEach((row,i)=>{
      if(row.querySelector('.desktop-tier-icon')) return;
      const src=art(tierOrder[i]||'runner');
      if(!src) return;
      const icon=document.createElement('img');
      icon.className='desktop-tier-icon';
      icon.src=src;
      icon.alt='';
      icon.setAttribute('aria-hidden','true');
      row.insertBefore(icon,row.firstChild);
    });
  }

  const sync=()=>{
    syncFloorTierArt();
    addTierIcons();
  };

  const start=()=>{
    sync();
    const obs=new MutationObserver(sync);
    obs.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
