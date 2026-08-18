const fs=require('fs'),path=require('path');
const hooks=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-native-hooks-v41.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(hooks.includes('window.confirmTicketOrder')&&hooks.includes("side==='SELL'")&&hooks.includes("side==='BUY'"),'native ticket confirmation is wrapped for ask posting and ask fills');
must(hooks.includes('window.confirmBidOrder')&&hooks.includes("insertPrice('bid',price)"),'native bid confirmation posts directly into native bid depth');
must(hooks.includes('window.updateBidOrderSummary')&&hooks.includes('price>=1&&price<terms.ask'),'bid UI allows any positive resting bid below the lowest ask');
must(hooks.includes('bidOrder.bestBid=0')&&hooks.includes('bidOrder.bestBid=terms.best'),'native highest-bid guard is temporarily relaxed and safely restored');
must(!hooks.includes('price>best&&price<ask'),'Stage 31 highest-bid-only posting restriction is removed');
must(hooks.includes("arr.sort(side==='offer'?(a,b)=>a-b:(a,b)=>b-a)"),'low bids are sorted into native bid depth instead of rejected');
must(hooks.includes('window.hitBestBid')&&hooks.includes('window.sellIntoBid'),'both native sell-into-bid paths are wrapped');
must(hooks.includes("insertPrice('offer',price)")&&hooks.includes("removePrice('offer',price)")&&hooks.includes("removePrice('bid',price)"),'native market arrays are updated for posts and fills');
must(hooks.includes("const ORDER_STORE='sbcTicketMarketOrdersV36'")&&hooks.includes("const SETTLE_STORE='sbcTicketSettlementV38'"),'native hooks share the existing My Orders and Recent Trades stores');
must(hooks.includes("m.last=Math.round(Number(price))")&&hooks.includes("renderTicketMarket==='function'")&&hooks.includes("renderTicketMarket()"),'completed fills update native last sale and redraw the native books');
must(loader.includes('/v45-ticket-native-hooks-v41.js?v=42'),'Stage 32 native bid hook is cache-busted');
console.log('Stage 31/32 native ticket exchange lifecycle and any-positive-bid checks passed.');
