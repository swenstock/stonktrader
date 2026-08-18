(()=>{
'use strict';
if(window.__sbcMyContestNativePositionV27)return;window.__sbcMyContestNativePositionV27=true;
let wasMy=false,arming=false;
function visible(el){if(!el)return false;const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;}
function enterNativePosition(){
  if(arming)return;arming=true;
  let tries=0;
  const tick=()=>{
    tries++;
    const view=document.getElementById('view-my');
    const list=document.getElementById('myContestList');
    const card=list?.querySelector('.mc-card.open')||list?.querySelector('.selected-entry-banner')?.closest('.mc-card')||list?.querySelector('.mc-card');
    if(view&&visible(view)&&card){
      const m=String(card.id||'').match(/^mc-(live|archive)-(.+)$/);
      if(m){
        const chips=[...card.querySelectorAll('.entry-chip')];
        const active=chips.findIndex(x=>x.classList.contains('active'));
        try{
          if(typeof selectMCEntry==='function'){
            selectMCEntry(m[1],m[2],active>=0?active:0);
            arming=false;
            return;
          }
        }catch(_){}
      }
    }
    if(tries<12){requestAnimationFrame(tick);return;}
    arming=false;
  };
  requestAnimationFrame(()=>requestAnimationFrame(tick));
}
function watch(){
  const view=document.getElementById('view-my');
  const on=!!(view&&visible(view));
  if(on&&!wasMy)enterNativePosition();
  wasMy=on;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
new MutationObserver(watch).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
setInterval(watch,400);
})();
