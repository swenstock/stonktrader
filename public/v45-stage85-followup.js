(()=>{
'use strict';
if(!window.matchMedia('(min-width:901px)').matches||window.__sbcStage85Followup)return;window.__sbcStage85Followup=true;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
let universe=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function installStyle(){if($('#stage85FollowupStyle'))return;const s=document.createElement('style');s.id='stage85FollowupStyle';s.textContent=`
@media(min-width:901px){
/* Use stable ticker badges instead of remote logo images. */
.basket-logo-v85{display:none!important}.basket-logo-fallback-v85{display:grid!important}.basket-stock-v85{grid-template-columns:42px 68px minmax(0,1fr)!important}.basket-logo-fallback-v85{width:36px!important;height:36px!important;font-size:10px!important}
/* Make the reference universe easy to find in How It Works / Rules. */
#tradableUniverseV85{display:none!important}.tradable-universe-v86{margin:12px 0 16px!important;border:1px solid #31576a!important;border-radius:12px!important;background:#06151e!important;color:#e8f5fa!important;overflow:hidden!important}.tradable-universe-v86 summary{list-style:none;cursor:pointer;padding:13px 15px;font-size:12px;font-weight:1000;letter-spacing:.045em;color:#68d6ff;background:#081c27}.tradable-universe-v86 summary::-webkit-details-marker{display:none}.tradable-universe-v86 summary:after{content:'VIEW LIST';float:right;color:#9fb8c4;font-size:9px}.tradable-universe-v86[open] summary:after{content:'HIDE LIST'}.tradable-universe-v86 p{margin:0;padding:10px 15px 2px;color:#91aab6;font-size:10px}.tradable-universe-v86 .grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;padding:10px 15px 15px}.tradable-universe-v86 .grid span{padding:8px 6px;border:1px solid #254859;border-radius:7px;background:#071923;color:#66d5ff;font-size:9px;font-weight:1000;text-align:center}
/* Stable slider drag: visual updates while dragging, builder commit on release. */
.bb19-ticket-row input[type='range']{touch-action:pan-y!important;cursor:ew-resize!important}
}
@media(min-width:901px) and (max-width:1120px){.tradable-universe-v86 .grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;document.head.appendChild(s)}
function updateSliderVisual(range){const row=range.closest('.bb19-ticket-row');if(!row)return;const strong=$('strong',row);if(strong)strong.textContent=`${Number(range.value).toFixed(2)}%`;const ranges=$$('[data-bb19-range]');const total=ranges.reduce((n,r)=>n+Number(r.value||0),0);const aside=$('.bb19-pane:nth-child(2) .bb19-pane-head aside');if(aside){const main=$('strong',aside),small=$('small',aside);if(main)main.textContent=`${total.toFixed(1)}%`;if(small)small.textContent=total>100.0001?`${(total-100).toFixed(1)}% OVER`:total<99.999?`${(100-total).toFixed(1)}% CASH`:'0.0% CASH';aside.classList.toggle('over',total>100.0001)}}
function wireSliders(){$$('[data-bb19-range]').forEach(r=>{if(r.dataset.stableDragV86)return;const commit=r.oninput;if(typeof commit!=='function')return;r.dataset.stableDragV86='1';r.oninput=()=>updateSliderVisual(r);r.onchange=()=>{commit.call(r);setTimeout(wireSliders,0)}})}
async function getUniverse(){if(universe)return universe;const r=await fetch('/api/quotes/symbols'),d=await r.json();if(!r.ok)throw new Error('Could not load SBC stocks.');universe=(Array.isArray(d)?d:[]).slice().sort((a,b)=>String(a.symbol).localeCompare(String(b.symbol)));return universe}
async function ensureReferenceList(){const host=$('#view-how')||$('#view-rules');if(!host||$('#tradableUniverseTopV86',host))return;try{const list=await getUniverse(),d=document.createElement('details');d.id='tradableUniverseTopV86';d.className='tradable-universe-v86';d.innerHTML=`<summary>TRADABLE STOCKS — ${list.length} CURRENTLY ENABLED</summary><p>This is the same server list used by Add Stocks in the basket builder.</p><div class="grid">${list.map(x=>`<span title="${esc(x.name||'')}">${esc(x.symbol)}</span>`).join('')}</div>`;const heading=$('h1,h2',host),anchor=heading?.parentElement===host?heading:null;if(anchor)anchor.after(d);else host.prepend(d)}catch(_){}}
function sync(){installStyle();wireSliders();ensureReferenceList()}
function start(){sync();setTimeout(sync,250);setTimeout(sync,900);document.addEventListener('click',e=>{if(e.target.closest?.('.bb19-overlay,[onclick*="showView"],#view-how,#view-rules'))setTimeout(sync,0)},false);document.addEventListener('change',e=>{if(e.target.matches?.('[data-bb19-range]'))setTimeout(wireSliders,0)},false)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
