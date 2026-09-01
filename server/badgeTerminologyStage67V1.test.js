const assert=require('assert');
const fs=require('fs');
const path=require('path');

const src=fs.readFileSync(path.join(__dirname,'..','public','v45-stage67-ux.js'),'utf8');
assert(src.includes('Jr. Stonk Broker Badge'),'canonical Jr. Stonk Broker Badge label missing');
assert(!src.includes('Jr. Broker Badge'),'legacy Jr. Broker Badge wording still present in projected payouts');
assert(src.includes("'JR. STONKBROKER'"),'Jr. StonkBroker ticket-tier label must remain distinct');
console.log('Badge Terminology Stage67 V1: PASS');
