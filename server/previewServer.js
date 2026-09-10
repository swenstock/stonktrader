require('dotenv').config();
const express=require('express');
const http=require('http');
const path=require('path');
const fs=require('fs');
const cors=require('cors');
const {exactV45Shell}=require('./v45ExactShell');

process.env.PAYOUT_ENGINE_V45='true';
if(process.env.TEST_MODE==='true'&&!process.env.TEST_SATELLITE_MINUTES)process.env.TEST_SATELLITE_MINUTES='20';
require('./schemaV45').run();
const {seedPrototypeAccount}=require('./seedPrototypeAccount');

const authRoutes=require('./routes/auth');
const accountRoutes=require('./routes/account');
const configRoutes=require('./routes/config');
const economicsRoutes=require('./routes/economics');
const quoteRoutes=require('./routes/quotes');
const quoteBarsRoutes=require('./routes/quoteBars');
const simulatedMarketRoutes=require('./routes/simulatedMarket');
const marketQueueRoutes=require('./routes/marketQueueV14');
const advancedOrdersV15Routes=require('./routes/advancedOrdersV15');
const portfolioRoutes=require('./routes/portfolios');
const quickTicketRoutes=require('./routes/quickTickets');
const leaderboardRoutes=require('./routes/leaderboard');
const leaderboardV45Routes=require('./routes/leaderboardV45');
const contestRoutes=require('./routes/contests');
const satelliteRoutes=require('./routes/satellites');
const ticketRoutes=require('./routes/tickets');
const referralRoutes=require('./routes/referrals');
const allocationRoutes=require('./routes/allocations');
const scheduledOrderRoutes=require('./routes/scheduledOrders');
const ticketMarketRoutes=require('./routes/ticketMarket');
const badgeMarketV45Routes=require('./routes/badgeMarketV45');
const exchangeHistoryV1Routes=require('./routes/exchangeHistoryV1');
const adminRoutes=require('./routes/admin');
const testClockRoutes=require('./routes/testClock');
const devRoutes=require('./routes/dev');
const satelliteScheduler=require('./satelliteSchedulerV45');
const marketOpenScheduler=require('./marketOpenScheduler');
const marketQueueV14=require('./marketQueueV14');
const {attachWebSocket}=require('./ws');

const ROOT=path.join(__dirname,'..');
const PUBLIC=path.join(ROOT,'public');
const CATALOG_PATH=path.join(ROOT,'config','product-catalog-v2.json');
const TURTLE_ART_DIR=path.join(__dirname,'turtle_art_v1');
const TURTLE_ART_FILES=Object.freeze({freeroll:'freeroll.png',runner:'runner.png',clerk:'clerk.png',trader:'trader.png',broker:'junior.png'});
function readCatalog(){return JSON.parse(fs.readFileSync(CATALOG_PATH,'utf8'))}

const app=express();
app.use(cors());app.use(express.json());
app.use('/api/auth',authRoutes);
app.use('/api/account',accountRoutes);
app.use('/api/config',configRoutes);
app.use('/api/economics',economicsRoutes);
app.use('/api/quotes/bars',quoteBarsRoutes);
app.use('/api/quotes',quoteRoutes);
app.use('/api/sim-market',simulatedMarketRoutes);
app.use('/api/advanced-orders-v15',advancedOrdersV15Routes);
app.use('/api/portfolios',marketQueueRoutes);
app.use('/api/portfolios',portfolioRoutes);
app.use('/api/quick-tickets',quickTicketRoutes);
app.use('/api/leaderboard',leaderboardRoutes);
app.use('/api/leaderboard-v45',leaderboardV45Routes);
app.use('/api/contests',contestRoutes);
app.use('/api/satellites',satelliteRoutes);
app.use('/api/tickets',ticketRoutes);
app.use('/api/referrals',referralRoutes);
app.use('/api/allocations',allocationRoutes);
app.use('/api/scheduled-orders',scheduledOrderRoutes);
app.use('/api/ticket-market',ticketMarketRoutes);
app.use('/api/badge-market',badgeMarketV45Routes);
app.use('/api/exchange-history',exchangeHistoryV1Routes);
app.use('/api/admin',adminRoutes);
app.use('/api/test-clock',testClockRoutes);
app.use('/api/dev',devRoutes);
app.get('/api/v2/catalog',(_req,res)=>res.json(readCatalog()));
app.get('/api/preview-health',(_req,res)=>res.json({ok:true,shell:'og-sbc-with-coin-prize-overlay-v1',catalogVersion:readCatalog().version,productionMainUntouched:true}));
app.get('/preview-turtles/:tier.png',(req,res)=>{
 const file=TURTLE_ART_FILES[req.params.tier];
 if(!file)return res.status(404).end();
 return res.sendFile(path.join(TURTLE_ART_DIR,file));
});

satelliteScheduler.start();marketOpenScheduler.start();marketQueueV14.start();

const TUTORIAL_PAUSE=`<script>(function(){try{var views=['lobby','floor','my','tier','portfolio','exchange','leaders'];localStorage.setItem('sbcDisableMainTutorialV45','1');views.forEach(function(v){localStorage.setItem('sbcDisableViewTutorialV45:'+v,'1');});window.SBC_TUTORIALS_PAUSED=true;}catch(e){window.SBC_TUTORIALS_PAUSED=true;}})();</script>`;
const EXTRA_HEAD=TUTORIAL_PAUSE+
'<link rel="stylesheet" href="/v45-mature-chart-owner-v1.css?v=1">'+
'<link rel="stylesheet" href="/v45-trade-receipt-v1.css?v=4">'+
'<link rel="stylesheet" href="/v45-mobile-polish.css?v=4">'+
'<link rel="stylesheet" href="/v45-mobile-v3.css?v=4">'+
'<link rel="stylesheet" href="/v45-mobile-v4.css?v=4">'+
'<link rel="stylesheet" href="/v45-desktop-icons.css?v=2">'+
'<link rel="stylesheet" href="/v45-usability-v5.css?v=51">'+
'<link rel="stylesheet" href="/v45-trade-cleanup-v8.css?v=10">'+
'<link rel="stylesheet" href="/v45-quick-ticket-v11.css?v=12">'+
'<link rel="stylesheet" href="/v45-advanced-orders-v15.css?v=20">'+
'<link rel="stylesheet" href="/v45-trade-ui-polish-v16.css?v=29">'+
'<link rel="stylesheet" href="/v45-header-stocks-v16.css?v=16">'+
'<link rel="stylesheet" href="/v45-basket-builder-v19.css?v=64">'+
'<link rel="stylesheet" href="/v45-basket-stability-v1.css?v=2">'+
'<link rel="stylesheet" href="/v45-entry-actions-v20.css?v=21">'+
'<link rel="stylesheet" href="/v45-leaderboard-v30.css?v=35">'+
'<link rel="stylesheet" href="/v45-desktop-trading-v45.css?v=45">'+
'<link rel="stylesheet" href="/v45-desktop-refine-v46.css?v=46">'+
'<link rel="stylesheet" href="/v45-desktop-stage42-v47.css?v=48">'+
'<link rel="stylesheet" href="/v45-desktop-stage43-v48.css?v=49">'+
'<link rel="stylesheet" href="/v45-desktop-stage44-v49.css?v=49">'+
'<link rel="stylesheet" href="/v45-desktop-stage45-v50.css?v=51">'+
'<link rel="stylesheet" href="/v45-desktop-stage46-v51.css?v=51">'+
'<link rel="stylesheet" href="/v45-stage67-ux.css?v=67">'+
'<link rel="stylesheet" href="/v45-stage-c-ui-cleanup-v1.css?v=1">'+
'<link rel="stylesheet" href="/v45-trader-action-confirm-v42.css?v=42">'+
'<link rel="stylesheet" href="/v45-lobby-install-v1.css?v=1">'+
'<link rel="stylesheet" href="/preview-og-prize-v1.css?v=1">';
const EXTRA_BODY=
'<script src="/v45-mobile-v3.js?v=4"></script><script src="/v45-mobile-v4.js?v=4"></script><script src="/v45-desktop-icons.js?v=2"></script><script src="/v45-usability-v5.js?v=51"></script><script src="/v45-backend-authority-v1.js?v=1"></script><script src="/v45-trade-cleanup-v8.js?v=10"></script><script src="/v45-quick-ticket-v11.js?v=12"></script><script src="/v45-basket-stage1.js?v=1"></script><script src="/v45-market-queue-v14.js?v=14"></script><script src="/v45-workspace-portfolio-v1.js?v=1"></script><script src="/v45-advanced-orders-v15.js?v=20"></script><script src="/v45-trade-ui-polish-v16.js?v=29"></script><script src="/v45-header-stocks-v16.js?v=16"></script><script src="/v45-portfolio-header-v44.js?v=44"></script><script src="/v45-basket-loader-v43.js?v=47"></script><script src="/v45-basket-builder-v19.js?v=48"></script><script src="/v45-entry-actions-v20.js?v=21"></script><script src="/v45-mycontest-native-position-v27.js?v=27"></script><script src="/v45-view-landings-v29.js?v=29"></script><script src="/v45-leaderboard-v30.js?v=31"></script><script src="/v45-leaderboard-order-v31.js?v=33"></script><script src="/v45-native-orders-v45.js?v=45"></script><script src="/v45-desktop-trading-v45.js?v=46"></script><script src="/v45-desktop-stage42-v47.js?v=48"></script><script src="/v45-desktop-stage43-v48.js?v=49"></script><script src="/v45-desktop-stage46-v51-pre.js?v=71"></script><script src="/v45-desktop-stage44-v49.js?v=49"></script><script src="/vendor/lightweight-charts-4.2.3.js"></script><script src="/v45-active-symbol-sync-v1.js?v=3"></script><script src="/v45-mature-chart-owner-v1.js?v=1"></script><script src="/v45-desktop-stage45-v50.js?v=57"></script><script src="/v45-stage67-ux.js?v=67"></script><script src="/v45-price-sync-v1.js?v=5"></script><script src="/v45-queue-confirm-rescue-v1.js?v=1"></script><script src="/v45-stage85-ui.js?v=1"></script><script src="/v45-stage85-followup.js?v=2"></script><script src="/v45-stage89-financial-ui.js?v=1"></script><script src="/v45-advanced-chart-indicators-v1.js?v=1"></script><script src="/v45-trade-receipt-v1.js?v=7"></script><script src="/v45-stage-c-ui-cleanup-v1.js?v=1"></script><script src="/v45-lobby-install-v1.js?v=1"></script><script src="/preview-og-prize-v1.js?v=1"></script>';

let servedShell=exactV45Shell.toString('utf8');
servedShell=servedShell
 .replace('function maybeShowFirstVisitTutorial(){','function maybeShowFirstVisitTutorial(){ return; /* PREVIEW HARD PAUSE */')
 .replace('function maybeShowContextTutorial(view){','function maybeShowContextTutorial(view){ return; /* PREVIEW HARD PAUSE */')
 .replace('</head>',`${EXTRA_HEAD}</head>`)
 .replace('</body>',`${EXTRA_BODY}</body>`);
const previewShell=Buffer.from(servedShell,'utf8');

app.get(['/', '/preview', '/v45-exact'],(_req,res)=>res.type('html').send(previewShell));
app.use('/v45',(_req,res)=>res.redirect(302,'/'));
app.use(express.static(PUBLIC,{index:false}));

const server=http.createServer(app);attachWebSocket(server);
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>{
 console.log(`SBC OG-shell coin-prize preview running on ${PORT}`);
 seedPrototypeAccount({baseUrl:`http://127.0.0.1:${PORT}`}).catch(err=>console.error(`Prototype seed failed: ${err.message}`));
});
