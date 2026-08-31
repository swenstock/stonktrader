(()=>{
'use strict';
if(window.__SBC_EXCHANGE_HISTORY_STAGE2_V1)return;window.__SBC_EXCHANGE_HISTORY_STAGE2_V1=true;
const $=(s,r=document)=>r.querySelector(s);
let requestSeq=0;
function activeMarket(){const active=$('#ticketTypeSelector .active');if(!active)return null;if(active.id==='sbcBadgeMarketTab')return'badge';const text=String(active.textContent||'').toUpperCase();if(/JR\.?\s*(STONK\s*)?BROKER|JUNIOR/.test(text))return'junior';if(text.includes('TRADER'))return'trader';if(text.includes('CLERK'))return'clerk';if(text.includes('RUNNER'))return'runner';return null;}
function labelCell(cell,text){const span=cell?.querySelector?.('span');if(span)span.textContent=text;}
function ensureStrip(){const bid=$('#summaryBid'),ask=$('#summaryAsk'),last=$('#summaryLast');if(!bid||!ask||!last)return null;const strip=bid.closest?.('.market-summary');if(!strip||ask.closest?.('.market-summary')!==strip||last.closest?.('.market-summary')!==strip)return null;const bidCell=bid.closest?.('.sum'),askCell=ask.closest?.('.sum'),lastCell=last.closest?.('.sum'),historyCell=lastCell?.nextElementSibling;if(!bidCell||!askCell||!lastCell||!historyCell)return null;labelCell(bidCell,'HIGHEST BID');labelCell(askCell,'LOWEST ASK');labelCell(lastCell,'LAST TRADE');let button=historyCell.querySelector?.('#sbcExchangeHistoryButton');if(!button){historyCell.textContent='';button=document.createElement('button');button.id='sbcExchangeHistoryButton';button.type='button';button.className='sbc-history-button';button.textContent='HISTORY';button.setAttribute?.('aria-label','Open Exchange transaction history');Object.assign(button.style||{}, {width:'100%',padding:'8px 10px',border:'1px solid #24465b',borderRadius:'8px',background:'rgba(42,181,255,.08)',color:'#2ab5ff',font:'inherit',fontWeight:'700',cursor:'pointer'});historyCell.appendChild(button);}return{strip,bid,ask,last,historyCell,button};}
async function refreshLastTrade(){const ui=ensureStrip(),market=activeMarket();if(!ui)return null;if(!market){ui.last.textContent='—';return null;}const seq=++requestSeq;try{const r=await window.fetch(`/api/exchange-history?limit=1&offset=0&market=${encodeURIComponent(market)}`),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`History request failed (${r.status})`);if(seq!==requestSeq||activeMarket()!==market)return null;const row=Array.isArray(d.rows)?d.rows[0]:null;ui.last.textContent=row?.price==null?'—':Number(row.price).toLocaleString();ui.last.dataset&&(ui.last.dataset.sbcHistoryMarket=market);return row||null;}catch(_){if(seq===requestSeq&&activeMarket()===market)ui.last.textContent='—';return null;}}
function refresh(){ensureStrip();return refreshLastTrade();}
function boot(){refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener?.('sbc:exchange-rendered',refresh);
window.addEventListener?.('sbc:exchange-heartbeat',refresh);
window.__SBC_EXCHANGE_HISTORY_STAGE2_TEST={activeMarket,ensureStrip,refreshLastTrade,refresh};
})();
