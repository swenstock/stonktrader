const fs=require('fs');const path=require('path');
const basket=fs.readFileSync(path.join(__dirname,'..','public','v45-basket-builder-v19.js'),'utf8');
const landing=fs.readFileSync(path.join(__dirname,'..','public','v45-view-landings-v29.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(basket.includes("typeof currentPortfolio==='function'?currentPortfolio():null"),'basket uses native currentPortfolio');
must(basket.includes("nativeCtx()?.mode==='reserve'")||basket.includes("ctx.mode==='reserve'"),'basket respects native reserve/live mode');
must(!basket.includes("Could not identify this portfolio"),'numeric portfolio-id dead end removed');
must(!basket.includes("api(`/portfolios/${id}`"),'basket no longer requires backend portfolio lookup');
must(basket.includes("p.queued.push(order)")&&basket.includes("p.holdings[r.symbol]"),'basket writes to native V45 queued/live portfolio state');
must(landing.includes("NORMAL_TOP=new Set(['lobby','floor','tier','portfolio','exchange','leaders'])"),'major views have normalized top landings');
must(landing.includes('setTimeout(resetTop,500)'),'landing reset cancels late stale smooth scroll');
must(/v45-basket-builder-v19\.js\?v=(?:29|30)/.test(server),'native basket enhancement is served');
must(server.includes('v45-view-landings-v29.js?v=29'),'view landing v29 is served');
console.log('Stage 17 UI regression checks passed.');
