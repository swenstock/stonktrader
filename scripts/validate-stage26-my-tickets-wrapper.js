const fs=require('fs'),path=require('path'),Module=require('module');
const target=path.join(__dirname,'validate-stage26-my-tickets.js');
let src=fs.readFileSync(target,'utf8');
const staticBootstrap="must(server.includes('/v45-exchange-dialog-v1.js?v=6')&&server.includes('/v45-exchange-layout-sales-v1.js?v=2'),'server serves cache-busted Exchange dialog and layout helpers');";
if(!src.includes(staticBootstrap))throw new Error('Stage 26 static bootstrap assertion changed; review wrapper before proceeding.');
const m=new Module(target,module);
m.filename=target;
m.paths=module.paths;
m._compile(src,target);
