const fs=require('fs');const path=require('path');
const order=fs.readFileSync(path.join(__dirname,'..','public','v45-leaderboard-order-v31.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(order.includes("const live=$('.live-section',view)"),'finds live contest section');
must(order.includes("parent.insertBefore(live,tierGrid)"),'moves live contests before tier grid');
must(/v45-leaderboard-order-v31\.js\?v=\d+/.test(server),'contest-first order patch is served');
must(server.includes('leaderboardOrder: "v31-contest-first"'),'health marker reports contest-first order');
console.log('Stage 19 leaderboard order checks passed.');
