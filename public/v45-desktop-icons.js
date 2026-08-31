(()=>{
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

  const start=()=>{
    addTierIcons();
    const obs=new MutationObserver(addTierIcons);
    obs.observe(document.body,{childList:true,subtree:true});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
