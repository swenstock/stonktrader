const fs=require('fs'),path=require('path');
const settle=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-settlement-v38.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-settlement-v38.css'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(settle.includes("const STORE='sbcTicketSettlementV38'")&&settle.includes('st.x[type]'),'prototype ticket fills persist inventory deltas');
must(settle.includes("settle(type,1,'BUY'")&&settle.includes("settle(type,-1,'SELL'"),'buy adds a ticket and sell removes a ticket');
must(settle.includes('RECENT TRADES')&&settle.includes("metric('LAST SALE'")&&settle.includes("'24H SALES'"),'completed fills update recent trades and exchange sale metrics');
must(css.includes('.tm35-market-modal.open')&&css.includes('position:fixed!important')&&css.includes('align-items:center!important')&&css.includes('justify-content:center!important'),'exchange confirmation modals are viewport centered');
must(loader.includes('/v45-ticket-settlement-v38.js?v=38')&&loader.includes('/v45-ticket-settlement-v38.css?v=38'),'Stage 27 settlement layer is loaded with fresh cache keys');
must(!settle.includes("root.id==='ticketOrderModal'&&/^SELL\\b/.test(title)"),'posting an offer is not misclassified as a completed sell');
must(loader.includes('normalizeExchangePost')&&loader.includes('LIST ${old.replace'),'native SELL/POST offer wording is normalized so v36 adds it to the ask book');
must(loader.includes('wireBasketLive')&&loader.includes('updateBasketPreview')&&loader.includes("r.onchange=e=>{if(typeof commit==='function')commit.call(r,e);}"),'basket allocation percentages update live while dragging and commit on release');
console.log('Stage 27/28 ticket settlement and live basket regression checks passed.');