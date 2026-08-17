require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { exactV45Shell, EXPECTED_BYTES, EXPECTED_SHA256 } = require("./v45ExactShell");

// V45 is the rebuild default. Normalize this BEFORE any routes/schedulers are
// required so every module agrees on the active economic engine.
const useLegacySatellitePayout = String(process.env.PAYOUT_ENGINE_V45 || "v45").toLowerCase() === "legacy";
process.env.PAYOUT_ENGINE_V45 = useLegacySatellitePayout ? "legacy" : "true";

// Compressed QA rooms still need enough runway to exercise the real Degen
// 5-minute cutoff. Twenty minutes keeps tests fast without making entry
// impossible. Production ignores this unless TEST_MODE=true.
if (process.env.TEST_MODE === "true" && !process.env.TEST_SATELLITE_MINUTES) {
  process.env.TEST_SATELLITE_MINUTES = "20";
}

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
const satelliteScheduler = useLegacySatellitePayout
  ? require("./satelliteScheduler")
  : require("./satelliteSchedulerV45");
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
}));

// The approved V45 handoff is the visible application shell. Serve it before
// express.static so no older/newer public/index.html can silently replace it.
app.get(["/", "/v45-exact"], (req, res) => {
  res.type("html").send(exactV45Shell);
});

app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
attachWebSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Stonk paper trading server running on http://localhost:${PORT}`);
  console.log(`Satellite payout engine: ${satelliteScheduler.engineVersion || "legacy"}`);
  console.log(`Visible shell: exact V45 (${EXPECTED_BYTES} bytes, ${EXPECTED_SHA256})`);
});
