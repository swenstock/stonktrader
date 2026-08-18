const fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-leaderboard-v30.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(css.includes('#view-leaders #globalLeader{display:none!important}'),'inline leaderboard hidden below tier cards');
must(css.includes('.leader-v30-modal #globalLeader{display:block!important'),'leaderboard remains visible inside modal');
must(!css.includes('.leader-tier-v30 img{'),'tier portrait image sizing override removed');
must(!css.includes('.leader-tier-v30{min-height:'),'tier card height override removed');
must(server.includes('leaderboardPlacement: "v34-popup-only"'),'health reports popup-only leaderboard');
must(server.includes('leaderboardPortraits: "native-card-sizing"'),'health reports native tier card sizing');
must(server.includes('v45-leaderboard-v30.css?v=34'),'popup-only stylesheet is cache-busted');
console.log('Stage 22 leaderboard regression checks passed.');
