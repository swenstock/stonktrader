from pathlib import Path
import re, json

adv = Path('public/v45-advanced-orders-v15.js')
s = adv.read_text()
old = "async function api(path,opts={}){const t=token();const r=await fetch(`/api${path}`,{...opts,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})}});const out=await r.json().catch(()=>({}));if(!r.ok)throw new Error(out.error||`Request failed (${r.status})`);return out;}"
new = old + "\nasync function submitOrder(body){const out=await api('/advanced-orders-v15',{method:'POST',body:JSON.stringify(body)});await refresh(true);renderBlotter();emit();return out;}\nasync function portfolioSnapshot(){const pid=portfolioId();if(!pid)throw new Error('This portfolio could not be identified. Refresh the page and try again.');return api(`/portfolios/${pid}`);}"
assert old in s
s = s.replace(old,new,1)
assert "s.textContent=`@media(min-width:901px){#view-portfolio" in s
s = s.replace("s.textContent=`@media(min-width:901px){#view-portfolio", "s.textContent=`#view-portfolio", 1)
assert ".blotter-panel-v15[hidden]{display:none!important}}`;document.head.appendChild(s);}" in s
s = s.replace(".blotter-panel-v15[hidden]{display:none!important}}`;document.head.appendChild(s);}", ".blotter-panel-v15[hidden]{display:none!important}`;document.head.appendChild(s);}", 1)
old_export = "window.SBCAdvancedOrdersV15={refresh,cancelOrder,replaceOrder,openReplace,portfolioId,renderBlotter,get cache(){return cache;}};"
assert old_export in s
s = s.replace(old_export,"window.SBCAdvancedOrdersV15={refresh,cancelOrder,replaceOrder,openReplace,portfolioId,portfolioSnapshot,submitOrder,renderBlotter,get cache(){return cache;}};",1)
adv.write_text(s)

desk=Path('public/v45-desktop-trading-v45.js')
d=desk.read_text()
pat=re.compile(r"function openSellAll\(\)\{.*?\}\nasync function executeSellAll\(\)\{.*?\}\n\nlet activeOrderTab=",re.S)
replacement="""async function realSellAllSnapshot(){const api=window.SBCAdvancedOrdersV15;if(!api?.portfolioId||!api?.portfolioSnapshot||!api?.submitOrder)throw new Error('Real order service is unavailable. Refresh the page and try again.');const portfolioId=api.portfolioId();if(!portfolioId)throw new Error('This portfolio could not be identified. Refresh the page and try again.');const snapshot=await api.portfolioSnapshot();if(Number(snapshot?.id)!==Number(portfolioId))throw new Error('Portfolio identity changed. Refresh the page and try again.');return snapshot;}
function sellAllPositions(snapshot){return (Array.isArray(snapshot?.positions)?snapshot.positions:[]).filter(x=>Number(x?.quantity||0)>0&&String(x?.symbol||'').trim());}
async function submitSellAllOrdersV46(api,snapshot){const positions=sellAllPositions(snapshot),accepted=[],failed=[];for(const pos of positions){const body={portfolioId:Number(snapshot.id),symbol:String(pos.symbol).toUpperCase(),side:'sell',orderType:'market',quantity:Number(pos.quantity)};try{const out=await api.submitOrder(body);accepted.push({body,out});}catch(error){failed.push({body,error});}}return{positions,accepted,failed};}
async function openSellAll(){const trigger=$('[data-sell-all-v46]');if(trigger){trigger.disabled=true;trigger.textContent='CHECKING…';}try{const snapshot=await realSellAllSnapshot(),positions=sellAllPositions(snapshot);if(!positions.length){showConfirm('SELL ALL','NO OPEN POSITIONS','NOTHING TO SELL','This portfolio is already in cash.','✓');return;}closeSellAll();const root=document.createElement('div');root.id='sellAllConfirmV46';root.className='sell-all-confirm-v46';root.innerHTML=`<section role=\"dialog\" aria-modal=\"true\" aria-label=\"Sell all positions confirmation\"><button type=\"button\" class=\"sell-all-x-v46\" aria-label=\"Close\">×</button><small>PORTFOLIO ACTION</small><h2>SELL ALL POSITIONS?</h2><p>You are about to submit market sells for <b>${positions.length}</b> real open position${positions.length===1?'':'s'} in this portfolio.</p><div>SBC will execute immediately when trading is eligible or queue the market order for the next eligible opening window.</div><footer><button type=\"button\" data-sell-all-cancel-v46>CANCEL</button><button type=\"button\" data-sell-all-confirm-v46>CONFIRM SELL ALL</button></footer></section>`;root.__sellAllSnapshot=snapshot;document.body.appendChild(root);$('.sell-all-x-v46',root).onclick=closeSellAll;$('[data-sell-all-cancel-v46]',root).onclick=closeSellAll;root.onclick=e=>{if(e.target===root)closeSellAll()};$('[data-sell-all-confirm-v46]',root).onclick=executeSellAll;}catch(e){showConfirm('SELL ALL FAILED','REAL POSITIONS COULD NOT BE LOADED',e.message||String(e),'No orders were submitted.','!');}finally{if(trigger){trigger.disabled=false;trigger.textContent='SELL ALL';}}}
async function executeSellAll(){const btn=$('[data-sell-all-confirm-v46]'),root=document.getElementById('sellAllConfirmV46');if(btn){btn.disabled=true;btn.textContent='SUBMITTING…';}try{const api=window.SBCAdvancedOrdersV15,snapshot=root?.__sellAllSnapshot||await realSellAllSnapshot(),result=await submitSellAllOrdersV46(api,snapshot);if(!result.positions.length)throw new Error('No real open positions remain.');if(!result.accepted.length){const msg=result.failed[0]?.error?.message||'No market sell orders were accepted.';throw new Error(msg);}await api.refresh?.(true);api.renderBlotter?.();closeSellAll();if(result.failed.length){showConfirm('SELL ALL PARTIAL',`${result.accepted.length} OF ${result.positions.length} ORDERS ACCEPTED`,`${result.failed.length} ORDER${result.failed.length===1?'':'S'} FAILED`,'Review the real blotter before retrying failed positions.','!');}else{showConfirm('SELL ALL ACCEPTED',`${result.accepted.length} MARKET SELL ORDER${result.accepted.length===1?'':'S'} ACCEPTED`,'BACKEND CONFIRMED','Orders will execute now or at the next eligible opening window. Review Queue / Recent / Fills for status.','📉');}}catch(e){if(btn){btn.disabled=false;btn.textContent='CONFIRM SELL ALL';}showConfirm('SELL ALL FAILED','NO SUCCESS WAS ASSUMED',e.message||String(e),'Review the real blotter before trying again.','!');}}

let activeOrderTab="""
d2,n=pat.subn(replacement,d,count=1)
assert n==1,f'executeSellAll replacement count={n}'
anchor="function layoutPortfolioStats(){"
stylefn="function installOrdersPanelPolishV46(){if(document.getElementById('ordersPanelPolishV46'))return;const s=document.createElement('style');s.id='ordersPanelPolishV46';s.textContent='#view-portfolio .holdings-table-v45 th:nth-child(6),#view-portfolio .holdings-table-v45 td:nth-child(6){padding-left:4px!important;padding-right:6px!important}#view-portfolio .holdings-table-v45 td:nth-child(6) b{font-size:11px!important}#view-portfolio .trade-head button,#view-portfolio .trade-head a{font-size:10px!important;min-height:34px!important;padding:7px 10px!important}';document.head.appendChild(s);}\n"
assert anchor in d2
d2=d2.replace(anchor,stylefn+anchor,1)
d2=d2.replace("function layoutPortfolioStats(){\n","function layoutPortfolioStats(){\n  installOrdersPanelPolishV46();\n",1)
desk.write_text(d2)

test=Path('server/ordersActivityPanelFixes.test.js')
test.write_text("""const fs=require('fs');const vm=require('vm');const assert=require('assert');
const adv=fs.readFileSync('public/v45-advanced-orders-v15.js','utf8');const desk=fs.readFileSync('public/v45-desktop-trading-v45.js','utf8');
assert(!adv.includes('s.textContent=`@media(min-width:901px){#view-portfolio'),'legacy blotter hiding/scroll CSS must not be desktop-only');
assert(adv.includes(\"status:'CANCELLED'\"),'Recent Activity must include cancellations');
assert(adv.includes('portfolioSnapshot,submitOrder'),'real portfolio/order helpers must be exported');
assert(!desk.includes(\"p.queued.push({side:'SELL'\"),'Sell All must not push fake queued sells');
assert(!desk.includes('delete p.holdings[symbol]'),'Sell All must not mutate fake holdings');
const m=desk.match(/function sellAllPositions\\(snapshot\\)\\{.*?\\}\\nasync function submitSellAllOrdersV46\\(api,snapshot\\)\\{.*?\\}\\nasync function openSellAll/s);assert(m,'Sell All real-order core not found');
const ctx={};vm.runInNewContext(m[0].replace(/\\nasync function openSellAll[\\s\\S]*$/,'' )+';this.sellAllPositions=sellAllPositions;this.submitSellAllOrdersV46=submitSellAllOrdersV46;',ctx);
const calls=[];const api={submitOrder:async body=>{calls.push(body);return {ok:true,queued:true,id:calls.length};}};
(async()=>{const snap={id:77,positions:[{symbol:'AMZN',quantity:3.5},{symbol:'META',quantity:2},{symbol:'ZERO',quantity:0}]};const out=await ctx.submitSellAllOrdersV46(api,snap);assert.equal(out.positions.length,2);assert.equal(out.accepted.length,2);assert.equal(out.failed.length,0);assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)),[{portfolioId:77,symbol:'AMZN',side:'sell',orderType:'market',quantity:3.5},{portfolioId:77,symbol:'META',side:'sell',orderType:'market',quantity:2}]);const partialCalls=[];const partialApi={submitOrder:async body=>{partialCalls.push(body);if(body.symbol==='META')throw new Error('reject');return {ok:true};}};const partial=await ctx.submitSellAllOrdersV46(partialApi,snap);assert.equal(partial.accepted.length,1);assert.equal(partial.failed.length,1);assert.equal(partialCalls.length,2);console.log('Orders & Activity Panel Fixes: PASS');console.log('Sell All used real snapshot portfolio 77 and submitted one real market sell per actual holding; partial failures remain explicit.');})();
""")
pkg=Path('package.json');j=json.loads(pkg.read_text());j['scripts']['test:orders-activity-panel']='node server/ordersActivityPanelFixes.test.js';j['scripts']['test']='npm run test:orders-activity-panel && '+j['scripts']['test'];pkg.write_text(json.dumps(j,indent=2)+"\n")
