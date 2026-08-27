const fs=require('fs'),path=require('path');
const basket=fs.readFileSync(path.join(__dirname,'..','public','v45-basket-builder-v19.js'),'utf8');
const leader=fs.readFileSync(path.join(__dirname,'..','public','v45-leaderboard-v30.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-leaderboard-v30.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(basket.includes('const MIN=1'),'basket permits a single-stock ticket');
must(basket.includes('stockScroll:0')&&basket.includes('rememberStockScroll')&&basket.includes('restoreStockScroll'),'basket persists left stock-list scroll across rerenders');
must(basket.includes('state.defaultPct=10'),'basket keeps 10% default allocation');
must(leader.includes('/api/leaderboard-v45/sources')&&leader.includes('/api/leaderboard-v45/satellite/'),'leaderboard visible rows use real backend standings');
must(leader.includes('r.isMine===true')&&leader.includes("'NOT ENTERED'")&&leader.includes('truthState?.mine'),'YOU and Find Me depend on real backend ownership');
must(leader.includes('leaderV30-${r.rank}')&&leader.includes('data-real-portfolio-id'),'real leaderboard rows retain calculated rank and backend portfolio identity');
must(leader.includes('getBoundingClientRect')&&leader.includes("scrollTo({top:Math.max(0,top)"),'leaderboard jumps use scroller-relative coordinates');
must(leader.includes('openLeaderTier')&&leader.includes('openModal'),'tier selection opens leaderboard modal');
must(leader.includes('leader-main-event-v30')&&leader.includes('leader-v30-tier-grid'),'leader hierarchy marks main contest above tier group');
must(css.includes('.leader-main-event-v30')&&css.includes('.leader-v30-modal.open'),'larger contest art and modal presentation are styled');
must(/v45-leaderboard-v30\.js\?v=\d+/.test(server)&&/v45-leaderboard-v30\.css\?v=\d+/.test(server),'leaderboard v30 assets are served');
must(/createABasket: "v\d+-/.test(server)&&server.includes('leaderboardUi: "v30-modal-unified-ranks"'),'health exposes Stage 18 UI markers');
console.log('Stage 18 UI regression checks passed.');
