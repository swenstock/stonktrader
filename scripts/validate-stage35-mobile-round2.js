const fs=require('fs'),path=require('path');
const js=fs.readFileSync(path.join(__dirname,'..','public','v45-mobile-v6.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-mobile-v6.css'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'..','public','v45-mobile-v4.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(loader.includes('/v45-mobile-v6.css?v=6')&&loader.includes('/v45-mobile-v6.js?v=6'),'mobile v4 bootstrap loads Stage 35 v6 assets');
must(css.includes('.mobile-floor-brokers{display:none!important}')&&css.includes('.mobile-redundant-path-v6{display:none!important}'),'lobby broker strip and redundant Earn/Play/Win path are removed');
must(css.includes('.mobile-how-scroll-v6')&&css.includes('scroll-snap-type:x mandatory'),'How It Works becomes intentional horizontal swipe cards');
must(js.includes('mobile-contest-header-v6')&&css.includes('.mobile-native-contest-hero-v6{display:none!important}')&&css.includes('width:76px;height:76px'),'oversized Degen/native header is replaced by compact broker-led contest header');
must(css.includes('#view-portfolio #mobileTradeTabsV5')&&css.includes('display:none!important'),'dead Stage 34 portfolio tabs/context are retired');
must(js.includes("head.after(quick)")&&css.includes('.mobile-quick-trade-v6')&&css.includes('min-height:56px'),'Quick Trade is promoted ahead of the chart with large Buy/Sell actions');
must(css.includes('#view-portfolio #marketChart')&&css.includes('height:230px!important'),'mobile chart height is capped so it cannot consume the trading screen');
must(js.includes('mobilePositionsSheetV6')&&js.includes('Search positions')&&js.includes('TRADE ${x.symbol}')&&css.includes('.mobile-native-holdings-v6{display:none!important}'),'desktop positions table is replaced by scalable searchable positions sheet');
must(js.includes('jumpToMeMobile')&&js.includes('.leader-v30-you')&&js.includes('nearestScroller')&&js.includes('stopImmediatePropagation'),'Find Me targets the actual user row and modal scroller');
must(css.includes('@media(max-width:380px)'),'small-phone layout remains explicitly handled');
console.log('Stage 35 mobile round-two checks passed.');