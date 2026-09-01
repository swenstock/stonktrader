const assert=require('assert');
const fs=require('fs');
const path=require('path');

const race=fs.readFileSync(path.join(__dirname,'..','public','v45-broker-race-ui.js'),'utf8');
const stage4=fs.readFileSync(path.join(__dirname,'..','public','v45-stage4-junior-ui.js'),'utf8');

assert(race.includes('JR. STONK BROKER BADGES AWARDED'),'canonical awarded badge label missing');
assert(race.includes('JR. STONK BROKER BADGES COLLECTED'),'canonical collected badge label missing');
assert(race.includes('Collect Jr. Stonk Broker Badges'),'canonical promotion copy missing');
assert(race.includes('BADGE TO PROMOTION')&&race.includes('BADGES TO PROMOTION'),'promotion progress must identify badges');
assert(!race.includes('JR BROKERS AWARDED'),'legacy JR BROKERS awarded label remains');
assert(!race.includes('JR BROKERS COLLECTED'),'legacy JR BROKERS collected label remains');
assert(!race.includes('Collect Jr. StonkBrokers'),'legacy collectible wording remains');
assert(stage4.includes("s.src='/v45-broker-race-ui.js?v=2'"),'Stage 4 live Broker Race loader missing');
console.log('Broker Race Badge Terminology V1: PASS');
