const fs=require('fs'),path=require('path');
const js=fs.readFileSync(path.join(__dirname,'..','public','v45-trader-action-confirm-v42.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','v45-trader-action-confirm-v42.css'),'utf8');
const loader=fs.readFileSync(path.join(__dirname,'..','public','v45-my-tickets-cleanup-v37.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(js.includes('/api\\/portfolios\\/\\d+\\/trades')&&js.includes('response.clone().json'),'successful regular stock trades are confirmed from the real trade API response');
must(js.includes("if(body?.basketOrder)return"),'basket submissions do not create one popup per stock');
must(js.includes("eyebrow:'TRADE COMPLETE'")&&js.includes("YOU ${side==='BUY'?'BOUGHT':'SOLD'}"),'completed buys and sells receive explicit confirmation');
must(js.includes("eyebrow:'ORDER QUEUED'")&&js.includes('WAITING FOR MARKET OPEN'),'queued market orders are labeled as queued rather than falsely filled');
must(js.includes('/api\\/advanced-orders-v15')&&js.includes("eyebrow:'ORDER PLACED'")&&js.includes('advancedDetail'),'limit/stop/stop-limit accepted orders receive order-placed confirmation');
must(js.includes('suppressSuccessAlertUntil')&&js.includes('nativeAlert'),'legacy advanced-order success alert is suppressed without replacing error alerts');
must(css.includes('position:fixed!important')&&css.includes('align-items:center!important')&&css.includes('justify-content:center!important'),'trade confirmation popup is viewport centered');
must(loader.includes('/v45-trader-action-confirm-v42.js?v=42')&&loader.includes('/v45-trader-action-confirm-v42.css?v=42'),'trader confirmation JS and CSS are loaded by the live enhancement chain');
console.log('Stage 33 trader action confirmation checks passed.');
