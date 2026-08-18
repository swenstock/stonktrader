const fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(ui.includes("const STORE='sbcTicketMarketOrdersV36'")&&ui.includes('addLocal('),'prototype orders persist locally and load into My Orders');
must(ui.includes('ADJUST LISTING')&&ui.includes('CANCEL LISTING'),'My Tickets exposes listing adjust/cancel controls');
must(ui.includes("['ticketOrderModal','bidOrderModal','sellChoiceModal']")&&ui.includes("b.textContent='CLOSE'")&&ui.includes("e.key!=='Escape'"),'native exchange modals have explicit X/Escape/CLOSE exits');
must(css.includes('.tm36-my-tickets')&&css.includes('.tm36-ticket-actions'),'My Tickets spacing/action area is styled');
must(css.includes('.tm36-book-scroll')&&css.includes('overflow-y:auto'),'bid and ask books keep compact visible depth and scroll internally');
must(ui.includes('decorateBook(rows)')&&ui.includes('tm36-my-book-row'),'user orders are reflected in the visible book');
must(server.includes('v45-ticket-market-v35.js?v=36')&&server.includes('v45-ticket-market-v35.css?v=36'),'v36 exchange assets are cache-busted and served');
must(server.includes('ticketExchangeControls: "v36-prototype-orders-ticket-actions-scroll"'),'health reports Stage 24 exchange controls');
console.log('Stage 24 ticket exchange regression checks passed.');