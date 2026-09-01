const fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v36.js'),'utf8');
const own=fs.readFileSync(path.join(__dirname,'..','public','v45-exchange-own-orders-v1.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(!ui.includes("const STORE='sbcTicketMarketOrdersV36'")&&!ui.includes('addLocal('),'ticket orders no longer persist as browser-local fake orders');
must(ui.includes("'/api/ticket-market/offers'")&&ui.includes("'/api/ticket-market/bids'")&&ui.includes('/api/ticket-market/book/'),'ticket exchange routes creation and book display through real backend endpoints');
must(!ui.includes("id='tm36Mine'")&&!ui.includes('id="tm36Mine"')&&!ui.includes('<h3>MY ORDERS</h3>'),'retired standalone My Orders presentation is absent at source');
must(own.includes('sbc-own-book-row')&&own.includes('MANAGE ORDER')&&own.includes("method:'PATCH'")&&own.includes("method:'DELETE'")&&own.includes('/api/ticket-market/bids/')&&own.includes('/api/ticket-market/offers/'),'visible own order rows retain backend price-change and cancellation controls');
must(ui.includes("await api('/api/tickets')")&&ui.includes('ticket.id')&&!ui.includes('MY-ME-1'),'My Tickets renders authoritative backend inventory and real ticket ids');
must(ui.includes("['ticketOrderModal','bidOrderModal','sellChoiceModal']")&&ui.includes("b.textContent='CLOSE'")&&ui.includes("e.key!=='Escape'"),'native exchange modals have explicit X/Escape/CLOSE exits');
must(css.includes('.tm36-my-tickets')&&css.includes('.tm36-ticket-actions'),'My Tickets spacing/action area is styled');
must(css.includes('.tm36-book-scroll')&&css.includes('overflow-y:auto'),'bid and ask books keep compact visible depth and scroll internally');
must(ui.includes('decorateBook(rows)')&&ui.includes('tm36-my-book-row')&&own.includes('decorate()'),'user orders remain reflected in the visible book after account refresh');
must(server.includes('/v45-ticket-market-v36.js?v=39')&&server.includes('/v45-ticket-native-hooks-v41.js?v=49')&&server.includes('/v45-my-tickets-cleanup-v37.js?v=41')&&server.includes('/v45-main-event-retirement-v1.js?v=3')&&server.includes('/v45-badge-market-stage4.js?v=4')&&server.includes('/v45-ticket-market-v35.css?v=38'),'real-ticket runtime owner and cleaned Exchange assets are cache-busted and served');
must(server.includes('/v45-exchange-own-orders-v1.js?v=8'),'visible own-order management owner is statically served');
must(server.includes('ticketExchangeControls: "v36-real-ticket-authority"'),'health marker reports real ticket authority');
console.log('Stage 24 ticket exchange regression checks passed.');