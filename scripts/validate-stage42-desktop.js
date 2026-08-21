const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'public','v45-desktop-stage42-v47.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','v45-desktop-stage42-v47.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server','index.js'),'utf8');
function must(c,m){if(!c){console.error('FAIL:',m);process.exit(1)}console.log('PASS:',m)}
must(js.includes("matchMedia('(min-width:901px)')")&&css.includes('@media(min-width:901px)'),'Stage 42 is desktop-only');
must(css.includes('.bb19-pane:nth-child(2) .bb19-bottom')&&css.includes('position:sticky!important')&&css.includes('.bb19-ticket-list{min-height:0!important;overflow:auto!important}'),'basket review list scrolls while primary action stays visible');
must(js.includes("const LIB='sbcNamedBasketsV47'")&&js.includes('SAVE PORTFOLIO')&&js.includes('SAVED PORTFOLIOS')&&js.includes('applySaved'),'named baskets can be saved and restored from a dropdown');
must(js.includes('STONKBROKER GAME FILM')&&js.includes('game-film-insights-v47')&&css.includes('.game-film-actions-v47'),'existing Insights/Analyzer action is moved into Game Film');
must(js.includes('trading-workspace-v47')&&css.includes("grid-template-areas:'positions orders' 'trading trading'") ,'Positions and Orders share the upper workspace row');
must(css.includes('.chart-order-split-v47')&&css.includes('grid-template-columns:minmax(0,1.2fr) minmax(420px,.8fr)'),'Chart and Order Entry split the lower trading canvas');
must(css.includes('.quick-ticket-launch-v47')&&css.includes('min-width:210px!important')&&css.includes('min-height:52px!important'),'Create A Basket launcher is materially larger');
must(server.includes('/v45-desktop-stage42-v47.js?v=48')&&server.includes('/v45-desktop-stage42-v47.css?v=47'),'Stage 42 assets are cache-busted and served');
must(server.includes('basketLibrary: "v47-named-sticky-review"')&&server.includes('desktopWorkspace: "v47-positions-orders-chart-oe"')&&server.includes('gameFilmInsights: "v47-inline-analyzer"'),'health exposes Stage 42 features');
console.log('Stage 42 desktop checks passed.');
