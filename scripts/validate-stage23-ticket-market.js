const fs=require('fs'),path=require('path');
const route=fs.readFileSync(path.join(__dirname,'..','server','routes','ticketMarket.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(route.includes("router.patch('/offers/:id'")&&route.includes('UPDATE ticket_listings SET ask_price'),'active asks can be repriced');
must(route.includes("router.patch('/bids/:id'")&&route.includes('ticket_bid_hold_increase')&&route.includes('ticket_bid_hold_release'),'active bids adjust held STONK on reprice');
must(ui.includes('MY ORDERS')&&ui.includes('CHANGE PRICE')&&ui.includes('CANCEL ORDER'),'My Orders exposes edit and cancel controls');
must(ui.includes("b.textContent='CLOSE'")&&ui.includes("e.key==='Escape'")&&ui.includes("className='tm35-x'"),'exchange confirmation modals have normal close paths');
must(css.includes('.tm35-order')&&css.includes('.tm35-x'),'exchange controls are styled');
must(server.includes('v45-ticket-market-v35.js?v=35')&&server.includes('v45-ticket-market-v35.css?v=35'),'ticket market v35 assets are served');
must(server.includes('ticketExchangeControls: "v35-my-orders-reprice-close"'),'health marker reports Stage 23 exchange controls');
console.log('Stage 23 ticket market regression checks passed.');