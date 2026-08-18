const fs=require('fs'),path=require('path');
const basket=fs.readFileSync(path.join(__dirname,'..','public','v45-basket-builder-v19.js'),'utf8');
const leader=fs.readFileSync(path.join(__dirname,'..','public','v45-leaderboard-v30.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-leaderboard-v30.css'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(basket.includes('const MIN=1'),'basket permits a single-stock ticket');
must(basket.includes('stockScroll:0')&&basket.includes('rememberStockScroll')&&basket.includes('restoreStockScroll'),'basket persists left stock-list scroll across rerenders');
must(basket.includes('state.defaultPct=10'),'basket keeps 10% default allocation');
must(leader.includes('prototypeUserStanding')&&leader.includes('fullRows(key)'),'leaderboard visible rows use the same standing source as summary');
must(leader.includes('leaderV30-${r.rank}')&&leader.includes("s.rank")&&leader.includes("s.paidRank"),'user and money-line rows are generated at calculated ranks');
must(leader.includes('getBoundingClientRect')&&leader.includes("scrollTo({top:Math.max(0,top)"),'leaderboard jumps use scroller-relative coordinates');
must(leader.includes('openLeaderTier')&&leader.includes('openModal()'),'tier selection opens leaderboard modal');
must(leader.includes('leader-main-event-v30')&&leader.includes('leader-v30-tier-grid'),'leader hierarchy marks main contest above tier group');
must(css.includes('.leader-main-event-v30')&&css.includes('.leader-v30-modal.open'),'larger contest art and modal presentation are styled');
must(server.includes('v45-leaderboard-v30.js?v=30')&&server.includes('v45-leaderboard-v30.css?v=30'),'leaderboard v30 assets are served');
must(server.includes('createABasket: "v30-small-baskets-stable-scroll"')&&server.includes('leaderboardUi: "v30-modal-unified-ranks"'),'health exposes Stage 18 UI markers');
console.log('Stage 18 UI regression checks passed.');