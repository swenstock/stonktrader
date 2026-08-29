const fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
const hooks=fs.readFileSync(path.join(__dirname,'..','public','v45-ticket-native-hooks-v41.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(ui.includes("node.nodeType===Node.TEXT_NODE")&&ui.includes('node.remove()'),'cleanup removes raw descriptive text nodes');
must(ui.includes("const label=$('b',left)")&&ui.includes('node===label'),'cleanup preserves native bold tier/quantity label');
must(hooks.includes('setSignedOutInventoryState')&&hooks.includes("target.textContent='SIGN IN'")&&hooks.includes("Sign in to see your ticket inventory."),'signed-out Exchange does not display stale prototype ownership counts');
must(server.includes('v45-my-tickets-cleanup-v37.js?v=40'),'cache-busted My Tickets cleanup is served');
must(server.includes('myTicketsCleanup: "v40-signed-out-truthful-selector"'),'health reports signed-out truthful My Tickets inventory cleanup');
console.log('Stage 26 My Tickets regression checks passed.');
