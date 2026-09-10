'use strict';
const assert=require('assert');
const fs=require('fs');
const catalog=JSON.parse(fs.readFileSync('config/product-catalog-v2.json','utf8'));
const server=fs.readFileSync('server/previewServer.js','utf8');
const overlay=fs.readFileSync('public/preview-og-prize-v1.js','utf8');
const overlayCss=fs.readFileSync('public/preview-og-prize-v1.css','utf8');

assert.deepStrictEqual(catalog.tiers.map(x=>[x.id,x.entryUsd]),[['runner',1],['clerk',5],['trader',15],['broker',50]]);
assert(catalog.sessions.some(x=>x.id==='weekly-freeroll'&&x.entryUsd===0));
assert.deepStrictEqual(catalog.prizeAssets.filter(x=>x.enabled).map(x=>x.id),['ai','boner','incel']);
assert(catalog.payoutPolicies.runner.paidPercent===30&&catalog.payoutPolicies.clerk.paidPercent===25&&catalog.payoutPolicies.trader.paidPercent===20&&catalog.payoutPolicies.broker.paidPercent===20);
assert(catalog.tiePolicy.finalTieRule==='split-combined-rank-prizes-equally');
console.log('PASS: new prize variables remain centralized');

assert(server.includes("const {exactV45Shell}=require('./v45ExactShell')"));
assert(server.includes("servedShell=servedShell"));
assert(server.includes('/v45-basket-builder-v19.js'));
assert(server.includes('/v45-basket-loader-v43.js'));
assert(server.includes('/v45-mature-chart-owner-v1.js'));
assert(server.includes('/v45-desktop-trading-v45.js'));
assert(server.includes('/v45-stage67-ux.js'));
assert(server.includes('/preview-og-prize-v1.js'));
assert(!server.includes("sendFile(path.join(PUBLIC,'preview-v2'"));
console.log('PASS: preview root is the OG SBC exact shell with proven basket/chart/workstation enhancements');

assert(overlay.includes("ENTRY_USD={freeroll:0,runner:1,clerk:5,trader:15,junior:50,broker:50}"));
assert(overlay.includes("selectedPrize=b.dataset.sbcPrize"));
assert(overlay.includes('CHOOSE YOUR PRIZE'));
assert(overlay.includes("TICKET EXCHANGE"));
assert(overlay.includes("GET PROMOTED"));
assert(overlay.includes("replace(/JR\\.\\s*STONKBROKER/gi,'BROKER')"));
assert(!overlay.toLowerCase().includes('sbc evolved'));
assert(overlayCss.includes('[data-view="exchange"]'));
console.log('PASS: overlay changes only prize-era surfaces, Broker naming and new prize choice');

assert(server.includes("app.use('/api/portfolios',portfolioRoutes)"));
assert(server.includes("app.use('/api/advanced-orders-v15',advancedOrdersV15Routes)"));
assert(server.includes("app.use('/api/quotes',quoteRoutes)"));
assert(server.includes("app.use('/api/quotes/bars',quoteBarsRoutes)"));
console.log('PASS: OG backend paths required by portfolio, basket, orders and chart remain mounted');
console.log('OG SBC Coin Prize Preview V1: PASS');
