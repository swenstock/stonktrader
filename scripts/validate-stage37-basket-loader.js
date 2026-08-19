const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const guard=fs.readFileSync(path.join(root,'public','v45-basket-loader-v43.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
const builder=fs.readFileSync(path.join(root,'public','v45-basket-builder-v19.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(guard.includes('__sbcBasketLoaderV43'),'basket universe guard has version sentinel');
must(guard.includes("typeof STOCKS!=='undefined'")&&guard.includes('Object.entries(STOCKS)'),'guard still knows native V45 stock universe for diagnostics/fallback context');
must(guard.includes('api\\/quotes\\/symbols')&&guard.includes('window.fetch=function'),'guard intercepts only the symbol universe fetch path');
must(guard.includes('serverFirst')&&guard.includes('nativeFetch(input,init)'),'guard asks the server for the authoritative universe first');
must(guard.includes('fallback-timeout')&&guard.includes('fallback-error'),'guard has timeout and error fallback paths');
must(guard.includes('AAPL|Apple Inc.')&&guard.includes('VZ|Verizon Communications'),'fallback contains the SBC tradable universe endpoints');
const loaderPos=server.indexOf('/v45-basket-loader-v43.js?v=47');
const builderPos=server.indexOf('/v45-basket-builder-v19.js?v=31');
must(loaderPos>=0&&builderPos>=0&&loaderPos<builderPos,'served shell loads fresh universe guard before basket builder');
must(server.includes('createABasket: "v31-any-count-auto-rebalance"'),'Stage 25 basket health marker remains unchanged');
must(server.includes('basketLoader: "v43-resilient-universe"'),'Stage 37 basket loader health marker remains available');
must(builder.includes("await loadUniverse();renderBuilder();"),'existing basket builder behavior remains intact after universe load');
console.log('Stage 37 basket loader checks passed.');
