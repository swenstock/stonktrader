const fs=require('fs'),path=require('path');
const hooks=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-native-hooks-v41.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(hooks.includes("localStorage.getItem('token')")&&hooks.includes("Authorization:`Bearer ${token"),'fresh-session Exchange auth reuses the canonical SBC token');
must(hooks.includes('window.updateBidOrderSummary')&&hooks.includes('price>=1&&price<terms.ask'),'bid UI preserves any-positive-resting-bid validation');
must(hooks.includes('bidOrder.bestBid=0')&&hooks.includes('bidOrder.bestBid=terms.best'),'native highest-bid guard remains safely relaxed/restored for UI validation');
must(!hooks.includes('sbcTicketMarketOrdersV36')&&!hooks.includes('sbcTicketSettlementV38'),'native hooks no longer maintain fake local order or STONK settlement state');
must(!hooks.includes('insertPrice(')&&!hooks.includes('removePrice(')&&!hooks.includes('ensureFill('),'native hooks no longer mutate simulated ticket depth or balances');
must(loader.includes('/v45-ticket-native-hooks-v41.js?v=43'),'real-authority native hook is cache-busted');
console.log('Stage 31/32 ticket exchange auth + single-authority lifecycle checks passed.');
