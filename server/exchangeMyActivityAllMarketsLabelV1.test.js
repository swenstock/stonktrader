'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');

const src=fs.readFileSync(path.join(__dirname,'..','public','v45-exchange-my-activity-v1.js'),'utf8');
assert(src.includes('EXCHANGE LEDGER · ALL MARKETS'),'MY ACTIVITY header must explicitly identify global/all-markets scope');
assert(src.includes("api('/api/ticket-market/mine')"),'ticket activity feed must remain included');
assert(src.includes("api('/api/badge-market/mine')"),'Badge activity feed must remain included');
assert(src.includes("api('/api/account/junior-broker')"),'Junior-broker activity feed must remain included');
assert(src.includes('const [t,b,j]=await Promise.all'),'existing global merge behavior must remain intact');
console.log('Exchange My Activity All Markets Label V1: PASS');
