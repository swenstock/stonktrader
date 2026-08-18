require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { exactV45Shell, EXPECTED_BYTES, EXPECTED_SHA256 } = require("./v45ExactShell");

const useLegacySatellitePayout = String(process.env.PAYOUT_ENGINE_V45 || "v45").toLowerCase() === "legacy";
process.env.PAYOUT_ENGINE_V45 = useLegacySatellitePayout ? "legacy" : "true";
if (process.env.TEST_MODE === "true" && !process.env.TEST_SATELLITE_MINUTES) process.env.TEST_SATELLITE_MINUTES = "20";
require("./schemaV45").run();

const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const configRoutes = require("./routes/config");
const economicsRoutes = require("./routes/economics");
const quoteRoutes = require("./routes/quotes");
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
const adminRoutes = require("./routes/admin");
const testClockRoutes = require("./routes/testClock");
const devRoutes = require("./routes/dev");
const contestScheduler = require("./contestScheduler");
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
app.use("/api/admin", adminRoutes);
app.use("/api/test-clock", testClockRoutes);
app.use("/api/dev", devRoutes);

contestScheduler.start();
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
  createABasket: "v30-small-baskets-stable-scroll",
  marketQueue: "v14-degen-targets",
  advancedOrders: "v15-compact-stop-family",
  tradeUiPolish: "v28-dom-safe-quote-hide",
  headerStocks: "v16",
  entryActions: "v20-native-trade-preserved",
  entryTradeHandoff: "native-shell",
  myContestPosition: "v27-native-select-entry",
  viewLandings: "v29-stale-scroll-cancel",
  leaderboardUi: "v30-modal-unified-ranks",
  leaderboardOrder: "v31-contest-first",
  leaderboardPortraits: "v33-full-head-visible",
}));

const TUTORIAL_PAUSE = `<script>(function(){try{var views=['lobby','floor','my','tier','portfolio','exchange','leaders'];localStorage.setItem('sbcDisableMainTutorialV45','1');views.forEach(function(v){localStorage.setItem('sbcDisableViewTutorialV45:'+v,'1');});window.SBC_TUTORIALS_PAUSED=true;}catch(e){window.SBC_TUTORIALS_PAUSED=true;}})();</script>`;

const EXTRA_HEAD = TUTORIAL_PAUSE + '<link rel="stylesheet" href="/v45-mobile-polish.css?v=4"><link rel="stylesheet" href="/v45-mobile-v3.css?v=4"><link rel="stylesheet" href="/v45-mobile-v4.css?v=4"><link rel="stylesheet" href="/v45-desktop-icons.css?v=1"><link rel="stylesheet" href="/v45-usability-v5.css?v=51"><link rel="stylesheet" href="/v45-trade-cleanup-v8.css?v=10"><link rel="stylesheet" href="/v45-quick-ticket-v11.css?v=12"><link rel="stylesheet" href="/v45-advanced-orders-v15.css?v=20"><link rel="stylesheet" href="/v45-trade-ui-polish-v16.css?v=28"><link rel="stylesheet" href="/v45-header-stocks-v16.css?v=16"><link rel="stylesheet" href="/v45-basket-builder-v19.css?v=19"><link rel="stylesheet" href="/v45-entry-actions-v20.css?v=21"><link rel="stylesheet" href="/v45-leaderboard-v30.css?v=33">';
const EXTRA_BODY = '<script src="/v45-mobile-v3.js?v=4"></script><script src="/v45-mobile-v4.js?v=4"></script><script src="/v45-desktop-icons.js?v=1"></script><script src="/v45-usability-v5.js?v=51"></script><script src="/v45-mycontest-entry-sync-v7.js?v=8"></script><script src="/v45-trade-cleanup-v8.js?v=10"></script><script src="/v45-quick-ticket-v11.js?v=12"></script><script src="/v45-basket-stage1.js?v=1"></script><script src="/v45-market-queue-v14.js?v=14"></script><script src="/v45-advanced-orders-v15.js?v=20"></script><script src="/v45-trade-ui-polish-v16.js?v=28"></script><script src="/v45-header-stocks-v16.js?v=16"></script><script src="/v45-basket-builder-v19.js?v=30"></script><script src="/v45-entry-actions-v20.js?v=21"></script><script src="/v45-mycontest-native-position-v27.js?v=27"></script><script src="/v45-view-landings-v29.js?v=29"></script><script src="/v45-leaderboard-v30.js?v=30"></script><script src="/v45-leaderboard-order-v31.js?v=33"></script>';

let servedShell = exactV45Shell.toString("utf8");
servedShell = servedShell
  .replace('function maybeShowFirstVisitTutorial(){', 'function maybeShowFirstVisitTutorial(){ return; /* QA HARD PAUSE */')
  .replace('function maybeShowContextTutorial(view){', 'function maybeShowContextTutorial(view){ return; /* QA HARD PAUSE */')
  .replace("</head>", `${EXTRA_HEAD}</head>`)
  .replace("</body>", `${EXTRA_BODY}</body>`);
const exactV45WithEnhancements = Buffer.from(servedShell, "utf8");

app.get(["/", "/v45-exact"], (req, res) => res.type("html").send(exactV45WithEnhancements));
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
attachWebSocket(server);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Stonk paper trading server running on http://localhost:${PORT}`);
  console.log(`Satellite payout engine: ${satelliteScheduler.engineVersion || "legacy"}`);
  console.log(`Visible shell: exact V45 + full-head leaderboard portraits v33 + contest-first leaderboard order v31 + modal unified leaderboard v30 + small baskets with stable list scroll v30 + compact stop family + DOM-safe chart polish v28 + normalized view landings v29; tutorials hard-paused`);
});
