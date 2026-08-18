const fs=require('fs'),path=require('path');
const ui=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(ui.includes("node.nodeType===Node.TEXT_NODE")&&ui.includes('node.remove()'),'cleanup removes raw descriptive text nodes');
must(ui.includes("const label=$('b',left)")&&ui.includes('node===label'),'cleanup preserves native bold tier/quantity label');
must(server.includes('v45-my-tickets-cleanup-v37.js?v=37'),'v37 My Tickets cleanup is served');
must(server.includes('myTicketsCleanup: "v37-raw-text-removed"'),'health reports My Tickets cleanup');
console.log('Stage 26 My Tickets regression checks passed.');
