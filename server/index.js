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
const portfolioRoutes = require("./routes/portfolios");
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
app.use("/api/portfolios", portfolioRoutes);
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
  tutorialPrompts: "paused-for-qa",
}));

// QA pause: keep all tutorial code preserved in the exact V45 shell, but set
// its existing persistence flags before the application initializes so no
// automatic tutorial can interrupt desktop or mobile bug testing. These flags
// can be removed in one place when tutorials are re-enabled.
const TUTORIAL_PAUSE = `<script>(function(){try{var views=['lobby','home','trading-floor','tradingFloor','floor','my-contests','myContests','tier-lobby','tierLobby','portfolio','exchange','leaderboard','leaders'];localStorage.setItem('sbcDisableMainTutorialV45','true');views.forEach(function(v){localStorage.setItem('sbcDisableViewTutorialV45:'+v,'true');});window.SBC_TUTORIALS_PAUSED=true;}catch(e){window.SBC_TUTORIALS_PAUSED=true;}})();</script>`;

const EXTRA_HEAD = TUTORIAL_PAUSE + '<link rel="stylesheet" href="/v45-mobile-polish.css?v=4"><link rel="stylesheet" href="/v45-mobile-v3.css?v=4"><link rel="stylesheet" href="/v45-mobile-v4.css?v=4"><link rel="stylesheet" href="/v45-desktop-icons.css?v=1"><link rel="stylesheet" href="/v45-usability-v5.css?v=51">';
const EXTRA_BODY = '<script src="/v45-mobile-v3.js?v=4"></script><script src="/v45-mobile-v4.js?v=4"></script><script src="/v45-desktop-icons.js?v=1"></script><script src="/v45-usability-v5.js?v=51"></script>';
const exactV45WithEnhancements = Buffer.from(
  exactV45Shell.toString("utf8")
    .replace("</head>", `${EXTRA_HEAD}</head>`)
    .replace("</body>", `${EXTRA_BODY}</body>`),
  "utf8"
);

app.get(["/", "/v45-exact"], (req, res) => res.type("html").send(exactV45WithEnhancements));
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
attachWebSocket(server);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Stonk paper trading server running on http://localhost:${PORT}`);
  console.log(`Satellite payout engine: ${satelliteScheduler.engineVersion || "legacy"}`);
  console.log(`Visible shell: exact V45 (${EXPECTED_BYTES} bytes, ${EXPECTED_SHA256}) + mobile v4 + desktop icons v1 + usability v5.1 stable; tutorials paused for QA`);
});
