const fs=require('fs'),path=require('path');
const route=fs.readFileSync(path.join(__dirname,'..','server','routes','quickTickets.js'),'utf8');
const basket=fs.readFileSync(path.join(__dirname,'..','public','v45-basket-builder-v19.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(route.includes('const MIN_STOCKS = 1'),'server preview permits one-stock baskets');
must(!route.includes('requires at least 10 unique stocks'),'legacy ten-stock minimum message removed');
must(basket.includes('const MIN=1'),'basket UI permits any count starting at one');
must(basket.includes("const cap=()=>state.isDegen?100:10"),'standard cap remains 10 percent and Degen may exceed it');
must(basket.includes('function autoRebalanceForCount()')&&basket.includes('100/n')&&basket.includes('state.selected.size>10'),'more than ten stocks auto-rebalance below 10 percent');
must(basket.includes("AUTO-BALANCED"),'basket tells the user when count-based rebalance is active');
must(css.includes('.inv-left>div:last-child{min-width:0!important;font-size:0!important')&&css.includes('.inv-left>div:last-child b{display:block!important;font-size:16px!important'),'My Tickets hides descriptive text while preserving tier and quantity');
must(server.includes('createABasket: "v31-any-count-auto-rebalance"'),'health reports Stage 25 basket rules');
must(server.includes('v45-basket-builder-v19.js?v=31')&&server.includes('v45-ticket-market-v35.css?v=37'),'Stage 25 frontend assets are cache-busted');
console.log('Stage 25 basket/My Tickets regression checks passed.');
