(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcStage87Polish)return;window.__sbcStage87Polish=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const money=n=>`${n<0?'-':''}$${Math.abs(n).toLocaleString(undefined,{maximumFractionDigits:0})}`;
function installStyle(){if($('#stage87PolishStyle'))return;const s=document.createElement('style');s.id='stage87PolishStyle';s.textContent=`
@media(min-width:901px){
/* Make Current Positions materially easier to read. */
#view-portfolio .holdings-table-v45 th{font-size:10.5px!important;padding:9px 10px!important}
#view-portfolio .holdings-table-v45 td{font-size:13.5px!important;padding:11px 10px!important;line-height:1.35!important}
#view-portfolio .holdings-table-v45 td:first-child{font-size:15px!important}
#view-portfolio .holdings-table-v45 td b{font-size:13.5px!important}
#view-portfolio .holdings-table-v45 td small{font-size:10.5px!important}
#view-portfolio .positions-kpis-v45 .port-stat strong,#view-portfolio .positions-kpis-v45 .port-stat b{font-size:19px!important}
/* Keep Chart + Order Entry centered as one workstation. */
#view-portfolio .trading-workspace-v47>.chart-trade-card{width:min(100%,1320px)!important;justify-self:center!important;margin-left:auto!important;margin-right:auto!important}
#view-portfolio .chart-order-split-v47{width:100%!important;margin:0 auto!important}
/* Final basket review must keep the action reachable at every desktop height. */
.bb19-final{max-height:calc(100vh - 150px)!important;min-height:0!important;overflow:hidden!important}
.bb19-final .bb19-review-list{min-height:0!important;overflow:auto!important;padding-bottom:8px!important}
.bb19-final .bb19-bottom{position:sticky!important;bottom:0!important;z-index:60!important;margin-top:auto!important;padding:12px!important;background:#06131b!important;box-shadow:0 -10px 24px rgba(0,0,0,.4)!important}
.bb19-final #bb19Submit{min-height:56px!important;font-size:11px!important}
/* Hide contradictory legacy chips once a canonical queued quantity is present. */
#view-portfolio #queuedOrders .v87-legacy-order-chip{display:none!important}
}
`;document.head.appendChild(s)}
function wakeBasketToolbar(){const body=$('.bb19-overlay:not([hidden]) #bb19Body');if(!body)return;body.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:false}));}
function installFirstPaintHook(){document.addEventListener('click',e=>{if(!e.target.closest?.('.quick-ticket-launch'))return;queueMicrotask(wakeBasketToolbar);setTimeout(wakeBasketToolbar,0)},true)}
function parseCanonicalOrder(row){const text=clean(row?.textContent);if(!/\bBUY\b/i.test(text))return null;const m=text.match(/([\d,.]+)\s*sh\s*@\s*\$([\d,.]+)/i);if(!m)return null;const qty=Number(m[1].replace(/,/g,'')),price=Number(m[2].replace(/,/g,''));if(!(qty>0&&price>0))return null;return{qty,price,notional:qty*price};}
function normalizeQueuedOrders(){const rows=$$('#view-portfolio #queuedOrders > *');let reserved=0;for(const row of rows){const canonical=parseCanonicalOrder(row);if(!canonical)continue;reserved+=canonical.notional;const descendants=$$('*',row);for(const el of descendants){const t=clean(el.textContent);if(/^\d[\d,.]*\s*SHARES$/i.test(t)||/^\$[\d,.]+\s*NOTIONAL$/i.test(t))el.classList.add('v87-legacy-order-chip');}}
return reserved;}
function parseMoneyText(s){const m=String(s||'').match(/(-?)\$([\d,.]+)/);return m?(m[1]? -1:1)*Number(m[2].replace(/,/g,'')):null}
function metricByLabel(rx){return $$('.positions-kpis-v45 .port-stat').find(x=>rx.test(clean(x.textContent)))||null}
function valueNode(metric){if(!metric)return null;const all=$$('strong,b,em',metric);return all.find(x=>/[-+]?\$[\d,.]+/.test(clean(x.textContent)))||all[all.length-1]||null}
function correctReservedEquity(reserved){let reserveMode=false;try{reserveMode=typeof activePortfolioContext!=='undefined'&&activePortfolioContext?.mode==='reserve'}catch(_){}if(!reserveMode||!(reserved>0))return;
const pnlMetric=metricByLabel(/TOTAL P&L/i),valueMetric=metricByLabel(/PORTFOLIO VALUE/i);for(const [metric,kind] of [[pnlMetric,'pnl'],[valueMetric,'value']]){const node=valueNode(metric);if(!node)continue;const current=clean(node.textContent);if(current!==node.dataset.v87CorrectedText){const parsed=parseMoneyText(current);if(parsed==null)continue;node.dataset.v87Base=String(parsed)}const base=Number(node.dataset.v87Base);if(!Number.isFinite(base))continue;const corrected=base+reserved;node.textContent=kind==='pnl'?(corrected>=0?`+${money(corrected)}`:money(corrected)):money(corrected);node.dataset.v87CorrectedText=clean(node.textContent)}
}
function syncFinancialDisplay(){const reserved=normalizeQueuedOrders();correctReservedEquity(reserved)}
function sync(){installStyle();syncFinancialDisplay();}
function start(){installStyle();installFirstPaintHook();sync();setTimeout(sync,250);setTimeout(sync,900);document.addEventListener('click',e=>{if(e.target.closest?.('#view-portfolio,.bb19-overlay,[data-orders-tab-v45]'))setTimeout(sync,0)},false);document.addEventListener('change',e=>{if(e.target.closest?.('#view-portfolio,.bb19-overlay'))setTimeout(sync,0)},false);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
