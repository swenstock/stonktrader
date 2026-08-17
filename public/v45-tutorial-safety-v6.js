(()=>{
  const visible=el=>!!(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none');
  const txt=el=>(el?.textContent||'').trim().replace(/\s+/g,' ').toUpperCase();

  function findActiveTourControls(){
    const buttons=[...document.querySelectorAll('button,[role="button"]')].filter(visible);
    const skip=buttons.find(b=>txt(b).includes('SKIP FOR NOW'));
    const next=buttons.find(b=>/^NEXT\b/.test(txt(b))||txt(b)==='NEXT →'||txt(b)==='NEXT');
    const back=buttons.find(b=>/^BACK\b/.test(txt(b)));
    if(!skip||!next)return null;
    return {skip,next,back};
  }

  function commonAncestor(a,b){
    if(!a||!b)return null;
    let n=a;
    while(n&&n!==document.body){if(n.contains(b))return n;n=n.parentElement;}
    return null;
  }

  function chooseCard({skip,next,back}){
    let card=commonAncestor(skip,next);
    if(back)card=commonAncestor(card||skip,back)||card;
    // Climb until the node looks like the actual tutorial card rather than a button row.
    let n=card;
    while(n&&n!==document.body){
      const r=n.getBoundingClientRect();
      const text=txt(n);
      if(r.width>=260&&r.height>=120&&(text.includes('SKIP FOR NOW')||text.includes('OF '))) return n;
      n=n.parentElement;
    }
    return card;
  }

  function makeSafe(){
    const controls=findActiveTourControls();
    if(!controls)return;
    const card=chooseCard(controls);
    if(!card)return;
    document.querySelectorAll('.v45-tutorial-safe-card').forEach(el=>{if(el!==card)el.classList.remove('v45-tutorial-safe-card');});
    card.classList.add('v45-tutorial-safe-card');

    let row=commonAncestor(controls.skip,controls.next);
    if(row&&row!==card&&card.contains(row))row.classList.add('v45-tutorial-safe-actions');

    // Keep the active card reachable even after the original tour repositions it.
    requestAnimationFrame(()=>{
      const r=card.getBoundingClientRect();
      if(r.top<8||r.bottom>innerHeight-8||r.left<8||r.right>innerWidth-8){
        card.scrollTop=0;
      }
    });
  }

  const observer=new MutationObserver(()=>makeSafe());
  const start=()=>{
    makeSafe();
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
    addEventListener('resize',makeSafe,{passive:true});
    addEventListener('orientationchange',makeSafe,{passive:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
