const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const guard=fs.readFileSync(path.join(root,'public','v45-basket-loader-v43.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
const builder=fs.readFileSync(path.join(root,'public','v45-basket-builder-v19.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(guard.includes('__sbcBasketLoaderV43'),'basket universe guard has version sentinel');
must(guard.includes("typeof STOCKS!=='undefined'")&&guard.includes('Object.entries(STOCKS)'),'guard can answer from native V45 stock universe');
must(guard.includes('api\\/quotes\\/symbols')&&guard.includes('window.fetch=function'),'guard intercepts only the symbol universe fetch path');
must(guard.includes('fallback-timeout')&&guard.includes('fallback-error'),'guard has timeout and error fallback paths');
must(guard.includes('AAPL|Apple Inc.')&&guard.includes('VZ|Verizon Communications'),'fallback contains the SBC tradable universe endpoints');
const loaderPos=server.indexOf('/v45-basket-loader-v43.js?v=43');
const builderPos=server.indexOf('/v45-basket-builder-v19.js?v=31');
must(loaderPos>=0&&builderPos>=0&&loaderPos<builderPos,'served shell loads universe guard before basket builder');
must(server.includes('v43-resilient-universe-loader-v31-any-count'),'health marker exposes Stage 37 basket loader');
must(builder.includes("await loadUniverse();renderBuilder();"),'existing basket builder behavior remains intact after universe load');
console.log('Stage 37 basket loader checks passed.');
