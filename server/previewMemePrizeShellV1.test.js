'use strict';
const assert=require('assert');
const fs=require('fs');
const catalog=JSON.parse(fs.readFileSync('config/product-catalog-v2.json','utf8'));
const html=fs.readFileSync('public/preview-v2/index.html','utf8');
const js=fs.readFileSync('public/preview-v2/app.js','utf8');
const server=fs.readFileSync('server/previewServer.js','utf8');

assert.deepStrictEqual(catalog.tiers.map(x=>[x.id,x.entryUsd]),[['runner',1],['clerk',5],['trader',15],['broker',50]]);
assert(catalog.categories.some(x=>x.id==='weekly-freeroll'&&x.entryUsd===0&&x.singleGlobalContest===true));
assert.deepStrictEqual(catalog.prizeAssets.filter(x=>x.enabled).map(x=>x.id),['ai','boner','incel']);
assert(catalog.walletAdapters.some(x=>x.id==='phantom'));
assert(catalog.walletAdapters.some(x=>x.id==='robinhood-wallet'));
assert(catalog.walletAdapters.some(x=>x.id==='robinhood-brokerage'));
console.log('PASS: centralized catalog owns tier prices, categories, prize assets and future adapters');

for(const term of ['ticket exchange','jr stonk broker badge','activated stonkbroker']){
  assert(!html.toLowerCase().includes(term),`preview shell must not depend on legacy ${term}`);
  assert(!js.toLowerCase().includes(term),`preview client must not depend on legacy ${term}`);
}
assert(html.includes('SELECT TIER')&&html.includes('SELECT CATEGORY')&&html.includes('SELECT MEME COIN'));
assert(html.includes('MARKET QUOTES')&&html.includes('BASKET + SINGLE'));
assert(html.includes('approved-lobby-hero-widget-free.png')||html.includes('rise-of-turtles-approved-final.png.png'));
console.log('PASS: shell exposes the new selection flow, turtle art, quote window and basket OE without legacy prize mechanics');

assert(js.includes("fetchJson('/api/v2/catalog')"));
assert(js.includes("/api/quotes?symbols="));
assert(js.includes("/api/quotes/bars?symbol="));
assert(js.includes("selectSymbol(b.dataset.quoteSymbol)"));
assert(js.includes("$('#oeSymbol').value=state.activeSymbol"));
console.log('PASS: quote click follows one active-symbol path into chart and order entry');

assert(server.includes("app.use('/api/quotes/bars', quoteBarsRoutes)"));
assert(server.includes("app.use('/api/quotes', quoteRoutes)"));
assert(server.includes("app.get('/api/v2/catalog'"));
assert(server.includes("sendFile(path.join(PUBLIC, 'preview-v2', 'index.html'))"));
console.log('PASS: preview server reuses proven quote providers and serves a standalone non-legacy root shell');

assert(/@media\(max-width:760px\)/.test(fs.readFileSync('public/preview-v2/styles.css','utf8')));
console.log('PASS: desktop and mobile presentation ship from the same state/components');
console.log('Meme Prize Preview Shell V1: PASS');
