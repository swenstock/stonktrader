(()=>{
'use strict';
if(window.__sbcQueuedActivityV1)return;window.__sbcQueuedActivityV1=true;
const STORE='sbcQueuedOrderActivityV1';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function ctx(){try{return typeof activePortfolioContext!=='undefined'?activePortfolioContext:null}catch(_){return null}}
function key(){const c=ctx();if(!c)return'';return [c.session||'',c.tier||c.tierId||'',c.entry||1,c.mode||'live'].join('|')}
function load(){try{const x=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
function save(rows){localStorage.setItem(STORE,JSON.stringify(rows.slice(-300)));}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function add(type,symbol,detail){const k=key();if(!k)return;const rows=load();rows.push({id:`Q${Date.now()}${Math.random().toString(36).slice(2,5)}`,portfolioKey:k,type,symbol:String(symbol||'').toUpperCase(),detail:clean(detail),at:Date.now()});save(rows);render();}
function render(){const box=$('#view-portfolio #tradeHistory');if(!box)return;$$('.queued-activity-v1',box).forEach(x=>x.remove());const k=key();if(!k)return;const rows=load().filter(x=>x.portfolioKey===k).slice(-60).reverse();if(!rows.length)return;const frag=document.createDocumentFragment();rows.forEach(x=>{const el=document.createElement('article');el.className='queued-activity-v1';el.innerHTML=`<div><small>${escapeHtml(x.type)}</small><b>${escapeHtml(x.symbol||'ORDER')}</b><span>${escapeHtml(x.detail)}</span></div><time>${new Date(x.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time>`;frag.appendChild(el);});box.prepend(frag);box.querySelector('.desktop-orders-empty-v45')?.remove();}
function parseBody(init){try{return typeof init?.body==='string'?JSON.parse(init.body):{}}catch(_){return{}}}
const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){const response=await nativeFetch(input,init);try{const url=typeof input==='string'?input:(input?.url||''),method=String(init?.method||input?.method||'GET').toUpperCase();if(method==='POST'&&/\/api\/portfolios\/\d+\/trades(?:\?|$)/.test(url)&&response.ok){const body=parseBody(init);if(!body?.basketOrder){const out=await response.clone().json().catch(()=>null);if(out?.queued){const symbol=String(out.symbol||body.symbol||'').toUpperCase(),side=String(out.side||body.side||'').toUpperCase();add('QUEUED',symbol,`${side||'ORDER'} placed • waiting for market open`);}}}}catch(_){}return response;};
document.addEventListener('click',e=>{const btn=e.target.closest?.('#view-portfolio #queuedOrders button');if(!btn||!/CANCEL/i.test(clean(btn.textContent)))return;const row=btn.closest('article,tr,[data-order-id],.queued-order-row')||btn.parentElement;const before=clean(row?.textContent||'');const symbol=(before.match(/\b[A-Z]{1,6}\b/g)||[]).find(x=>!['CANCEL','BUY','SELL','QUEUED','ORDER','AT','OPEN'].includes(x))||'';const check=()=>{if(row&&!document.contains(row)){add('CANCELLED',symbol,before.replace(/\bCANCEL\b/ig,'').slice(0,140)||'Queued order cancelled');return true}return false};setTimeout(()=>{if(!check())setTimeout(check,350)},120);},true);
document.addEventListener('click',e=>{if(e.target.closest?.('[data-orders-tab-v45="recent"]'))setTimeout(render,0);});
['renderPortfolio','showView'].forEach(name=>{const fn=window[name];if(typeof fn!=='function'||fn.__queuedActivityV1)return;const wrapped=function(){const out=fn.apply(this,arguments);setTimeout(render,0);return out;};wrapped.__queuedActivityV1=true;window[name]=wrapped;});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,0),{once:true});else setTimeout(render,0);
})();