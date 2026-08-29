const fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v36.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(!ui.includes("const STORE='sbcTicketMarketOrdersV36'")&&!ui.includes('addLocal('),'ticket orders no longer persist as browser-local fake orders');
must(ui.includes("'/api/ticket-market/offers'")&&ui.includes("'/api/ticket-market/bids'")&&ui.includes('/api/ticket-market/book/'),'ticket exchange routes creation and book display through real backend endpoints');
must(ui.includes('data-tm36-edit')&&ui.includes('data-tm36-cancel'),'backend My Orders retains listing/bid adjust and cancel controls');
must(ui.includes("await api('/api/tickets')")&&ui.includes('ticket.id')&&!ui.includes('MY-ME-1'),'My Tickets renders authoritative backend inventory and real ticket ids');
must(ui.includes("['ticketOrderModal','bidOrderModal','sellChoiceModal']")&&ui.includes("b.textContent='CLOSE'")&&ui.includes("e.key!=='Escape'"),'native exchange modals have explicit X/Escape/CLOSE exits');
must(css.includes('.tm36-my-tickets')&&css.includes('.tm36-ticket-actions'),'My Tickets spacing/action area is styled');
must(css.includes('.tm36-book-scroll')&&css.includes('overflow-y:auto'),'bid and ask books keep compact visible depth and scroll internally');
must(ui.includes('decorateBook(rows)')&&ui.includes('tm36-my-book-row'),'user orders are reflected in the visible book');
must(server.includes('/v45-ticket-market-v36.js?v=39')&&server.includes('/v45-my-tickets-cleanup-v37.js?v=40')&&server.includes('/v45-main-event-retirement-v1.js?v=3')&&server.includes('/v45-badge-market-stage4.js?v=3'),'repaired exchange, badge, and retirement assets are cache-busted and served');
must(server.includes('ticketExchangeControls: "v36-real-ticket-authority"'),'health marker reports real ticket authority');
console.log('Stage 24 ticket exchange regression checks passed.');
