(()=>{
'use strict';
if(typeof window==='undefined'||window.__sbcChartTimeframeOwnerGuardV1)return;
window.__sbcChartTimeframeOwnerGuardV1=true;
const norm=s=>String(s||'').trim().toUpperCase();
const MAP={'1S':'tick','1M':'1m','5M':'5m','15M':'15m','1H':'1h','1D':'1D'};
function timeframeForButton(button){
  if(!button)return'';
  const raw=button.dataset?.cwTime||button.textContent||'';
  return MAP[norm(raw)]||'';
}
function markActive(button){
  const toolbar=button.closest('.chart-toolbar,.chart-workstation-v1');
  if(!toolbar)return;
  [...toolbar.querySelectorAll('button')].forEach(b=>{
    if(!timeframeForButton(b))return;
    const active=b===button;
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',active?'true':'false');
  });
}
function matureOwnsChart(){
  const api=window.SBCMatureChartV1,state=api?.state;
  return !!(api&&state?.host&&document.body.contains(state.host)&&state.host.classList.contains('is-ready'));
}
document.addEventListener('click',e=>{
  const button=e.target?.closest?.('#view-portfolio .chart-toolbar button,#view-portfolio .chart-workstation-v1 button');
  if(!button)return;
  const tf=timeframeForButton(button);if(!tf||!matureOwnsChart())return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  markActive(button);
  window.SBCMatureChartV1.setTimeframe(tf);
},true);
})();
