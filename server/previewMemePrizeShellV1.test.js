'use strict';
const assert=require('assert');
const fs=require('fs');
const catalog=JSON.parse(fs.readFileSync('config/product-catalog-v2.json','utf8'));
const html=fs.readFileSync('public/preview-v2/index.html','utf8');
const js=fs.readFileSync('public/preview-v2/app.js','utf8');
const css=fs.readFileSync('public/preview-v2/styles.css','utf8');
const server=fs.readFileSync('server/previewServer.js','utf8');

assert.deepStrictEqual(catalog.tiers.map(x=>[x.id,x.entryUsd]),[['runner',1],['clerk',5],['trader',15],['broker',50]]);
assert(catalog.sessions.some(x=>x.id==='weekly-freeroll'&&x.entryUsd===0&&x.singleGlobalContest===true));
assert.deepStrictEqual(catalog.prizeAssets.filter(x=>x.enabled).map(x=>x.id),['ai','boner','incel']);
assert(catalog.payoutPolicies.runner.paidPercent===30);
assert(catalog.payoutPolicies.clerk.paidPercent===25);
assert(catalog.payoutPolicies.trader.paidPercent===20);
assert(catalog.payoutPolicies.broker.paidPercent===20);
assert(catalog.tiePolicy.finalTieRule==='split-combined-rank-prizes-equally');
assert(catalog.tiePolicy.tokenRemainderRule==='carry-to-prize-reserve');
console.log('PASS: catalog owns tiers, sessions, prize assets, payout depth and tie policy');

for(const term of ['ticket exchange','jr stonk broker badge','activated stonkbroker','sbc evolved']){
  assert(!html.toLowerCase().includes(term),`preview shell must not include ${term}`);
  assert(!js.toLowerCase().includes(term),`preview client must not include ${term}`);
}
for(const id of ['view-tiers','view-sessions','view-prizes','view-workstation']){
  assert(html.includes(`id="${id}"`),`missing sequential view ${id}`);
}
assert(html.indexOf('view-tiers')<html.indexOf('view-sessions'));
assert(html.indexOf('view-sessions')<html.indexOf('view-prizes'));
assert(html.indexOf('view-prizes')<html.indexOf('view-workstation'));
assert(html.includes('MARKET QUOTES')&&html.includes('BASKET + SINGLE'));
assert(html.includes('CHOOSE YOUR PRIZE'));
assert(html.includes('PRIZE LINE'));
console.log('PASS: tier -> session -> prize -> workstation flow is explicit and legacy economy language is absent');

assert((js.match(/function selectSymbol\(/g)||[]).length===1);
assert(js.includes('selectSymbol(b.dataset.quoteSymbol)'));
assert(js.includes("$('#oeSymbol').value=state.activeSymbol"));
assert(js.includes('/api/quotes?symbols='));
assert(js.includes('/api/quotes/bars?symbol='));
console.log('PASS: one selectSymbol function owns quote -> chart -> order-entry symbol flow');

assert(css.includes('html[data-theme="light"]'));
assert(css.includes('@media(max-width:800px)'));
assert(css.includes('.tier-grid'));
assert(css.includes('.prize-grid'));
console.log('PASS: dark/light themes and shared responsive composition are present');

assert(server.includes("app.use('/api/quotes/bars', quoteBarsRoutes)"));
assert(server.includes("app.use('/api/quotes', quoteRoutes)"));
assert(server.includes("app.get('/api/v2/catalog'"));
assert(server.includes("sendFile(path.join(PUBLIC, 'preview-v2', 'index.html'))"));
console.log('PASS: preview server reuses proven quote providers and standalone preview root');
console.log('Meme Prize Preview Shell V2: PASS');
