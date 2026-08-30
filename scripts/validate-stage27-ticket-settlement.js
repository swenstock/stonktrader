const fs=require('fs'),path=require('path');
const settle=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-settlement-v38.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(!settle.includes("const STORE='sbcTicketSettlementV38'")&&!settle.includes('st.x[type]')&&!settle.includes('localStorage.setItem'),'ticket settlement layer no longer fabricates inventory or STONK deltas');
must(settle.includes('forceBookScroll')&&settle.includes("overflow-y','scroll"),'useful order-book scrolling remains');
must(server.includes('/v45-ticket-settlement-v38.js?v=39'),'settlement cleanup is cache-busted by the static server bootstrap');
console.log('Stage 27 ticket settlement now preserves UI scrolling only; backend remains authoritative.');
