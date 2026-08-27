require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { exactV45Shell, EXPECTED_BYTES, EXPECTED_SHA256 } = require("./v45ExactShell");

if (String(process.env.PAYOUT_ENGINE_V45 || 'v45').toLowerCase() === 'legacy') {
  throw new Error('Legacy satellite payout engine is retired; PAYOUT_ENGINE_V45=legacy is no longer allowed');
}
const useLegacySatellitePayout = false;
process.env.PAYOUT_ENGINE_V45 = 'true';
if (process.env.TEST_MODE === "true" && !process.env.TEST_SATELLITE_MINUTES) process.env.TEST_SATELLITE_MINUTES = "20";
require("./schemaV45").run();

const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const configRoutes = require("./routes/config");
const economicsRoutes = require("./routes/economics");
const quoteRoutes = require("./routes/quotes");
const quoteBarsRoutes = require("./routes/quoteBars");
const simulatedMarketRoutes = require("./routes/simulatedMarket");
const marketQueueRoutes = require("./routes/marketQueueV14");
const advancedOrdersV15Routes = require("./routes/advancedOrdersV15");
const portfolioRoutes = require("./routes/portfolios");
const quickTicketRoutes = require("./routes/quickTickets");
const leaderboardRoutes = require("./routes/leaderboard");
const leaderboardV45Routes = require("./routes/leaderboardV45");
const contestRoutes = require("./routes/contests");
const satelliteRoutes = require("./routes/satellites");
const ticketRoutes = require("./routes/tickets");
const referralRoutes = require("./routes/referrals");
const allocationRoutes = require("./routes/allocations");
const scheduledOrderRoutes = require("./routes/scheduledOrders");
const ticketMarketRoutes = require("./routes/ticketMarket");
const badgeMarketV45Routes = require("./routes/badgeMarketV45");
const adminRoutes = require("./routes/admin");
const testClockRoutes = require("./routes/testClock");
const devRoutes = require("./routes/dev");
const contestScheduler = require("./contestScheduler");
const { retireOpenMainEvents } = require('./mainEventRetirementV45');
const satelliteScheduler = useLegacySatellitePayout ? require("./satelliteScheduler") : require("./satelliteSchedulerV45");
const marketOpenScheduler = require("./marketOpenScheduler");
const marketQueueV14 = require("./marketQueueV14");
const { attachWebSocket } = require("./ws");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/config", configRoutes);
app.use("/api/economics", economicsRoutes);
app.use("/api/quotes/bars", quoteBarsRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/sim-market", simulatedMarketRoutes);
app.use("/api/advanced-orders-v15", advancedOrdersV15Routes);
app.use("/api/portfolios", marketQueueRoutes);
app.use("/api/portfolios", portfolioRoutes);
app.use("/api/quick-tickets", quickTicketRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/leaderboard-v45", leaderboardV45Routes);
app.use("/api/contests", contestRoutes);
app.use("/api/satellites", satelliteRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/allocations", allocationRoutes);
app.use("/api/scheduled-orders", scheduledOrderRoutes);
app.use("/api/ticket-market", ticketMarketRoutes);
app.use("/api/badge-market", badgeMarketV45Routes);
app.use("/api/admin", adminRoutes);
app.use("/api/test-clock", testClockRoutes);
app.use("/api/dev", devRoutes);

// Main Event is history-only. Refund/restore any stale open entries once, then
// fail all future Main Event mutation paths closed.
const mainEventRetirement = retireOpenMainEvents();
if (mainEventRetirement.contestsRetired || mainEventRetirement.pendingAllocationsFailed) {
  console.warn('Main Event retirement applied', mainEventRetirement);
}
satelliteScheduler.start();
marketOpenScheduler.start();
marketQueueV14.start();

app.get("/api/health", (req, res) => res.json({
  ok: true,
  satellitePayoutEngine: satelliteScheduler.engineVersion || "legacy",
  marketDataProvider: process.env.MARKET_DATA_PROVIDER || "demo",
  shell: "SBC_INTERACTIVE_GUI_V45_TEST_CLOCK_HANDOFF",
  shellBytes: EXPECTED_BYTES,
  shellSha256: EXPECTED_SHA256,
  mobilePolish: "v4",
  desktopIcons: "v1",
  usability: "v5.1-stable",
  tutorialPrompts: "hard-paused-for-qa",
  myContestEntrySync: "v8-current-entry-helper",
  tradeCleanup: "v10",
  createABasket: "v32-first-paint-actions",
  basketLoader: "v43-resilient-universe",
  basketUniverse: "v47-server-first-59-symbols",
  basketControls: "v46-cash-sizing-rebalance",
  basketLibrary: "v48-synchronous-no-bounce",
  basketStability: "v2-reachable-controls",
  uiCleanup: "v89-financial-display-activity-mycontest-stonkbroker",
  marketQueue: "v14-degen-targets",
  queuedConfirm: "v1-navigation-escape",
  queuedActivity: "v1-placement-cancel-history",
  advancedOrders: "v15-compact-stop-family",
  tradeUiPolish: "v29-event-driven",
  priceSync: "v5-real-mycontest-owners",
  headerStocks: "v16",
  portfolioHeader: "v44-idempotent-dedupe",
  desktopTrading: "v46-workspace-sell-all-basket-sizing",
  desktopWorkspace: "v48-centered-full-width-positions",
  portfolioStability: "v1-fixed-top-row-large-chart",
  gameFilmInsights: "v47-inline-analyzer",
  chartOrderUi: "v48-dropdown-tools-context-prices",
  chartInteractions: "v49-scale-zoom-pan",
  chartStability: "v50-stable-wide-centered",
  chartGestureLock: "v51-single-engine-served",
  advancedChart: "v1-standalone-stage98-indicators",
  projectedPayouts: "v67-live-engine-projection",
  chartExpand: "v67-full-workspace-popout",
  tradeSizingMode: "v67-mutually-exclusive",
  myContestSlots: "v67-no-empty-placeholders",
  prizeInfo: "v69-compact-popout",
  entryActions: "v20-native-trade-preserved",
  entryTradeHandoff: "native-shell",
  myContestPosition: "v27-native-select-entry",
  viewLandings: "v29-stale-scroll-cancel",
  leaderboardUi: "v30-modal-unified-ranks",
  leaderboardOrder: "v31-contest-first",
  leaderboardPortraits: "native-card-sizing",
  leaderboardPlacement: "v34-popup-only",
  ticketExchangeControls: "v36-prototype-orders-ticket-actions-scroll",
  badgeExchange: "stage4-real-badge-market",
  exchangeFeePct: require("./economicsPolicyV45").EXCHANGE_FEE_PCT,
  mainEvent: "retired-history-only",
  freerollRemainder: "carry-forward",
  myTicketsCleanup: "v37-raw-text-removed",
  juniorCollectionUi: "stage4-v1",
}));

const TUTORIAL_PAUSE = `<script>(function(){try{var views=['lobby','floor','my','tier','portfolio','exchange','leaders'];localStorage.setItem('sbcDisableMainTutorialV45','1');views.forEach(function(v){localStorage.setItem('sbcDisableViewTutorialV45:'+v,'1');});window.SBC_TUTORIALS_PAUSED=true;}catch(e){window.SBC_TUTORIALS_PAUSED=true;}})();</script>`;

const EXTRA_HEAD = TUTORIAL_PAUSE + '<link rel="stylesheet" href="/v45-mobile-polish.css?v=4"><link rel="stylesheet" href="/v45-mobile-v3.css?v=4"><link rel="stylesheet" href="/v45-mobile-v4.css?v=4"><link rel="stylesheet" href="/v45-desktop-icons.css?v=1"><link rel="stylesheet" href="/v45-usability-v5.css?v=51"><link rel="stylesheet" href="/v45-trade-cleanup-v8.css?v=10"><link rel="stylesheet" href="/v45-quick-ticket-v11.css?v=12"><link rel="stylesheet" href="/v45-advanced-orders-v15.css?v=20"><link rel="stylesheet" href="/v45-trade-ui-polish-v16.css?v=29"><link rel="stylesheet" href="/v45-header-stocks-v16.css?v=16"><link rel="stylesheet" href="/v45-basket-builder-v19.css?v=64"><link rel="stylesheet" href="/v45-basket-stability-v1.css?v=2"><link rel="stylesheet" href="/v45-entry-actions-v20.css?v=21"><link rel="stylesheet" href="/v45-leaderboard-v30.css?v=34"><link rel="stylesheet" href="/v45-ticket-market-v35.css?v=37"><link rel="stylesheet" href="/v45-desktop-trading-v45.css?v=45"><link rel="stylesheet" href="/v45-desktop-refine-v46.css?v=46"><link rel="stylesheet" href="/v45-desktop-stage42-v47.css?v=48"><link rel="stylesheet" href="/v45-desktop-stage43-v48.css?v=48"><link rel="stylesheet" href="/v45-desktop-stage44-v49.css?v=49"><link rel="stylesheet" href="/v45-desktop-stage45-v50.css?v=50"><link rel="stylesheet" href="/v45-desktop-stage46-v51.css?v=51"><link rel="stylesheet" href="/v45-stage67-ux.css?v=67"><link rel="stylesheet" href="/v45-stage4-junior-ui.css?v=1">';
const EXTRA_BODY = '<script src="/v45-mobile-v3.js?v=4"></script><script src="/v45-mobile-v4.js?v=4"></script><script src="/v45-desktop-icons.js?v=1"></script><script src="/v45-usability-v5.js?v=51"></script><script src="/v45-mycontest-entry-sync-v7.js?v=8"></script><script src="/v45-trade-cleanup-v8.js?v=10"></script><script src="/v45-quick-ticket-v11.js?v=12"></script><script src="/v45-basket-stage1.js?v=1"></script><script src="/v45-market-queue-v14.js?v=14"></script><script src="/v45-advanced-orders-v15.js?v=20"></script><script src="/v45-trade-ui-polish-v16.js?v=29"></script><script src="/v45-header-stocks-v16.js?v=16"></script><script src="/v45-portfolio-header-v44.js?v=44"></script><script src="/v45-basket-loader-v43.js?v=47"></script><script src="/v45-basket-builder-v19.js?v=47"></script><script src="/v45-entry-actions-v20.js?v=21"></script><script src="/v45-mycontest-native-position-v27.js?v=27"></script><script src="/v45-view-landings-v29.js?v=29"></script><script src="/v45-leaderboard-v30.js?v=30"></script><script src="/v45-leaderboard-order-v31.js?v=33"></script><script src="/v45-ticket-market-v36.js?v=38"></script><script src="/v45-badge-market-stage4.js?v=1"></script><script src="/v45-my-tickets-cleanup-v37.js?v=37"></script><script src="/v45-ticket-market-v35.js?v=36"></script><script src="/v45-native-orders-v45.js?v=45"></script><script src="/v45-desktop-trading-v45.js?v=46"></script><script src="/v45-desktop-stage42-v47.js?v=48"></script><script src="/v45-desktop-stage43-v48.js?v=48"></script><script src="/v45-desktop-stage46-v51-pre.js?v=70"></script><script src="/v45-desktop-stage44-v49.js?v=49"></script><script src="/v45-desktop-stage45-v50.js?v=50"></script><script src="/v45-stage67-ux.js?v=67"></script><script src="/v45-price-sync-v1.js?v=5"></script><script src="/v45-queue-confirm-rescue-v1.js?v=1"></script><script src="/v45-stage85-ui.js?v=1"></script><script src="/v45-stage85-followup.js?v=2"></script><script src="/v45-stage89-financial-ui.js?v=1"></script><script src="/v45-advanced-chart-v1.js?v=1"></script><script src="/v45-advanced-chart-indicators-v1.js?v=1"></script><script src="/v45-stage4-junior-ui.js?v=1"></script><script src="/v45-main-event-retirement-v1.js?v=1"></script>';

let servedShell = exactV45Shell.toString("utf8");
servedShell = servedShell
  .replace('function maybeShowFirstVisitTutorial(){', 'function maybeShowFirstVisitTutorial(){ return; /* QA HARD PAUSE */')
  .replace('function maybeShowContextTutorial(view){', 'function maybeShowContextTutorial(view){ return; /* QA HARD PAUSE */')
  .replace("</head>", `${EXTRA_HEAD}</head>`)
  .replace("</body>", `${EXTRA_BODY}</body>`);
const exactV45WithEnhancements = Buffer.from(servedShell, "utf8");

app.get(["/", "/v45-exact"], (req, res) => res.type("html").send(exactV45WithEnhancements));
app.use("/v45", (_req, res) => res.redirect(302, "/"));
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
attachWebSocket(server);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Stonk paper trading server running on http://localhost:${PORT}`);
  console.log(`Satellite payout engine: ${satelliteScheduler.engineVersion || "legacy"}`);
  console.log(`Visible shell: exact V45 + Stage 4 Badge market + Stage 4 Junior collection/progress + Stage98 additive advanced chart indicator engine + standalone Stage94 advanced chart review overlay + price-sync v5 real My Contests owners + Stage89 financial display/activity + Stage87 first-paint basket actions/fixed submit/queue-equity display + Stage85 follow-up stable picker/slider/reference + centered full-width desktop workspace + Stage85 trader basket picker/readability cleanup + fixed-height portfolio top row/larger default chart/queued activity history + stabilized prize popout/basket controls/queue confirmation/performance + Stage 67 payout projections/chart popout/trade-size guard/My Contests cleanup + Stage 46 single-engine chart gesture lock v51 + Stage 45 stabilized/wide chart v50 + Stage 43 chart/order UI v48 + Stage 42 workspace v47; tutorials hard-paused`);
});
