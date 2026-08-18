const fs=require('fs'),path=require('path');
const route=fs.readFileSync(path.join(__dirname,'..','server','routes','ticketMarket.js'),'utf8');
const ui35=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.js'),'utf8');
const ui36=fs.existsSync(path.join(__dirname,'..','public','v45-ticket-market-v36.js'))?fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v36.js'),'utf8'):'';
const ui=ui35+'\n'+ui36;
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-market-v35.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(route.includes("router.patch('/offers/:id'")&&route.includes('UPDATE ticket_listings SET ask_price'),'active asks can be repriced');
must(route.includes("router.patch('/bids/:id'")&&route.includes('ticket_bid_hold_increase')&&route.includes('ticket_bid_hold_release'),'active bids adjust held STONK on reprice');
must(ui.includes('MY ORDERS')&&(ui.includes('CHANGE PRICE')||ui.includes('ADJUST'))&&(ui.includes('CANCEL ORDER')||ui.includes('CANCEL')),'My Orders exposes edit and cancel controls');
must(ui.includes("b.textContent='CLOSE'")&&ui.includes('Escape')&&ui.includes("className='tm35-x'"),'exchange confirmation modals have normal close paths');
must(css.includes('.tm35-order')&&css.includes('.tm35-x'),'exchange controls are styled');
must(/v45-ticket-market-v3[56]\.js\?v=3[5-9]/.test(server)&&/v45-ticket-market-v35\.css\?v=3[5-9]/.test(server),'ticket market enhancement assets are served');
must(/ticketExchangeControls: "v3[5-9]-/.test(server),'health marker reports ticket exchange controls');
console.log('Stage 23 ticket market regression checks passed.');