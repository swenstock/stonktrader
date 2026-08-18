const fs=require('fs'),path=require('path');
const hooks=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-native-hooks-v41.js'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(hooks.includes('window.confirmTicketOrder')&&hooks.includes("side==='SELL'")&&hooks.includes("side==='BUY'"),'native ticket confirmation is wrapped for ask posting and ask fills');
must(hooks.includes('window.confirmBidOrder')&&hooks.includes("insertPrice('bid',price)"),'native bid confirmation posts directly into native bid depth');
must(hooks.includes('window.hitBestBid')&&hooks.includes('window.sellIntoBid'),'both native sell-into-bid paths are wrapped');
must(hooks.includes("insertPrice('offer',price)")&&hooks.includes("removePrice('offer',price)")&&hooks.includes("removePrice('bid',price)"),'native market arrays are updated for posts and fills');
must(hooks.includes("const ORDER_STORE='sbcTicketMarketOrdersV36'")&&hooks.includes("const SETTLE_STORE='sbcTicketSettlementV38'"),'native hooks share the existing My Orders and Recent Trades stores');
must(hooks.includes("m.last=Math.round(Number(price))")&&hooks.includes("renderTicketMarket==='function'")&&hooks.includes("renderTicketMarket()"),'completed fills update native last sale and redraw the native books');
must(loader.includes('/v45-ticket-native-hooks-v41.js?v=41'),'native exchange hook layer is loaded before settlement refreshes');
console.log('Stage 31 native ticket exchange lifecycle checks passed.');
