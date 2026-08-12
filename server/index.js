require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const quoteRoutes = require("./routes/quotes");
const portfolioRoutes = require("./routes/portfolios");
const leaderboardRoutes = require("./routes/leaderboard");
const contestRoutes = require("./routes/contests");
const satelliteRoutes = require("./routes/satellites");
const ticketRoutes = require("./routes/tickets");
const referralRoutes = require("./routes/referrals");
const adminRoutes = require("./routes/admin");
const contestScheduler = require("./contestScheduler");
const satelliteScheduler = require("./satelliteScheduler");
const { attachWebSocket } = require("./ws");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/portfolios", portfolioRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/contests", contestRoutes);
app.use("/api/satellites", satelliteRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/admin", adminRoutes);

contestScheduler.start();
satelliteScheduler.start();

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
attachWebSocket(server);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Stonk paper trading server running on http://localhost:${PORT}`);
});
