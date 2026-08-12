// ---------------- Session ----------------
let token = localStorage.getItem("token");
let displayName = localStorage.getItem("displayName");

(function prefillReferralFromURL() {
  const params = new URLSearchParams(location.search);
  const ref = params.get("ref");
  if (!ref) return;
  const field = document.getElementById("signupReferral");
  if (field) field.value = ref.toUpperCase();
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector('.tab-btn[data-tab="signup"]')?.classList.add("active");
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("signupForm").style.display = "block";
})();

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 || data.error === "Account not found") {
      localStorage.removeItem("token");
      localStorage.removeItem("displayName");
      if (document.getElementById("appScreen").style.display !== "none") {
        alert("Your session expired — please log in again.");
        location.reload();
      }
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// ---------------- Auth screen ----------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isLogin = btn.dataset.tab === "login";
    document.getElementById("loginForm").style.display = isLogin ? "block" : "none";
    document.getElementById("signupForm").style.display = isLogin ? "none" : "block";
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("loginMsg");
  msg.textContent = "";
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value,
      }),
    });
    setSession(data.token, data.displayName);
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("signupMsg");
  msg.textContent = "";
  try {
    const data = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        displayName: document.getElementById("signupName").value,
        email: document.getElementById("signupEmail").value,
        password: document.getElementById("signupPassword").value,
        referralCode: document.getElementById("signupReferral").value,
      }),
    });
    setSession(data.token, data.displayName);
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("displayName");
  location.reload();
});

function setSession(t, name) {
  token = t;
  displayName = name;
  localStorage.setItem("token", t);
  localStorage.setItem("displayName", name);
  showApp();
}

function showApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("welcomeMsg").textContent = `Hey, ${displayName}`;
  boot();
}

// ---------------- Connect Wallet (simulated) ----------------
document.getElementById("connectWalletBtn").addEventListener("click", () => {
  const btn = document.getElementById("connectWalletBtn");
  if (btn.dataset.connected) return;
  const chars = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 4; i++) addr += chars[Math.floor(Math.random() * 16)];
  addr += "…";
  for (let i = 0; i < 4; i++) addr += chars[Math.floor(Math.random() * 16)];
  btn.textContent = addr;
  btn.dataset.connected = "1";
  btn.classList.remove("btn-outline");
  btn.classList.add("btn-gold");
});

// ---------------- Nav ----------------
document.querySelectorAll(".nav-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
  const el = document.getElementById(`${view}View`);
  if (el) el.style.display = "block";
  if (view === "mycontests") refreshMyContests();
  if (view === "leaderboards") refreshLeaderboards();
}

// ---------------- App state ----------------
let latestQuotes = {};
let selectedSymbol = "AAPL";
let selectedExchangeFilter = "ALL";
let chart, series;
const chartHistory = {};
let currentPortfolioId = null;

async function boot() {
  const symbols = await api("/quotes/symbols");
  window.__symbols = symbols;
  connectWebSocket();
  refreshPortfoliosBalance();
  refreshContests();
  refreshReferrals();
  setInterval(refreshPortfoliosBalance, 5000);
  setInterval(refreshContests, 5000);
  setInterval(tickCountdowns, 1000);
}

function connectWebSocket() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "quotes") {
      msg.data.forEach((q) => {
        latestQuotes[q.symbol] = q;
        if (q.symbol === selectedSymbol) pushChartPoint(q);
      });
      if (document.getElementById("tradeView").style.display !== "none") {
        renderWatchlist();
        refreshCurrentPortfolio();
      }
    }
  };
  ws.onclose = () => setTimeout(connectWebSocket, 2000);
}

// ---------------- STONK balance (nav) ----------------
async function refreshPortfoliosBalance() {
  try {
    const data = await api("/account");
    document.getElementById("navStonkBalance").textContent = data.stonkBalance.toLocaleString();
  } catch (e) {
    console.error(e);
  }
}

// ---------------- Lobby: satellites + Main Event ----------------
let contestsCache = { current: null, nextOpensAt: null, config: {}, history: [] };
let satellitesCache = { categories: [], history: [] };
let ticketsCache = { unredeemedCount: 0, tickets: [] };

async function refreshContests() {
  try {
    [contestsCache, satellitesCache, ticketsCache] = await Promise.all([
      api("/contests"),
      api("/satellites"),
      token ? api("/tickets") : Promise.resolve({ unredeemedCount: 0, tickets: [] }),
    ]);
    renderLiveStatsBar();
    renderSatelliteCategories();
    renderWeeklyRoom();
  } catch (err) {
    console.error(err);
  }
}

function renderLiveStatsBar() {
  const c = contestsCache.current;
  const el = document.getElementById("liveStatsBar");
  if (!c) {
    el.innerHTML = `<span><b class="dot">●</b> Floor closed for the weekend</span>`;
  } else {
    el.innerHTML = `
      <span><b class="dot">●</b> Floor open</span>
      <span><b>${c.entrantCount}</b> Main Event entries funded</span>
      <span><b>🔒 ${c.brokersProjected}</b> Broker${c.brokersProjected === 1 ? "" : "s"} locked</span>
      ${ticketsCache.unredeemedCount > 0 ? `<span><b>🎟️ ${ticketsCache.unredeemedCount}</b> ticket${ticketsCache.unredeemedCount === 1 ? "" : "s"} in your pocket</span>` : ""}
    `;
  }

  const countdownEl = document.getElementById("heroCountdown");
  const entriesEl = document.getElementById("heroEntries");
  const brokersEl = document.getElementById("heroBrokers");
  if (c) {
    countdownEl.dataset.ends = c.weekEnd;
    countdownEl.textContent = fmtCountdown(c.weekEnd);
    entriesEl.textContent = c.entrantCount.toLocaleString();
    brokersEl.textContent = c.brokersProjected;
  } else if (contestsCache.nextOpensAt) {
    countdownEl.dataset.ends = contestsCache.nextOpensAt;
    countdownEl.textContent = fmtCountdown(contestsCache.nextOpensAt);
    entriesEl.textContent = "0";
    brokersEl.textContent = "0";
  }
}

function fmtCountdown(target) {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "closing…";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h left`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} left`;
}

function tickCountdowns() {
  document.querySelectorAll(".countdown-text").forEach((el) => {
    if (el.dataset.ends) el.textContent = fmtCountdown(el.dataset.ends);
  });
}

// ---------------- Compact DraftKings-style satellite matrix ----------------
function renderSatelliteCategories() {
  const el = document.getElementById("satelliteCategories");
  el.innerHTML = satellitesCache.categories
    .map((cat) => {
      const rows = cat.levels
        .map((lvl) => {
          const isPending = lvl.status === "pending";
          const isLocked = lvl.status === "resolved";
          const statusLabel = lvl.joined
            ? "You're in"
            : isPending
              ? `Opens ${new Date(lvl.opensAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : isLocked
                ? "Locked"
                : fmtCountdown(lvl.locksAt);
          const btn = lvl.joined
            ? `<button class="btn btn-outline btn-sm" disabled>In</button>`
            : isPending || isLocked
              ? `<button class="btn btn-outline btn-sm" disabled>—</button>`
              : `<button class="btn btn-gold btn-sm join-sat-row-btn" data-id="${lvl.id}">Enter</button>`;
          return `<tr>
            <td>${lvl.name.split("—")[1]?.trim() || lvl.priceLevel}</td>
            <td class="mono">${lvl.entryFee.toLocaleString()} STONK</td>
            <td class="mono">${lvl.entrantCount}</td>
            <td class="mono">🎟️ ${lvl.ticketsProjected}</td>
            <td class="mono" style="color:var(--text-dim);font-size:11px;">${statusLabel}</td>
            <td>${btn}</td>
          </tr>`;
        })
        .join("");
      return `<div class="sat-category">
        <div class="sat-category-head"><span class="session-icon">${cat.icon}</span>${cat.name}</div>
        <table class="sat-table">
          <thead><tr><th>Level</th><th>Entry</th><th>Traders</th><th>Tickets</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join("");

  el.querySelectorAll(".join-sat-row-btn").forEach((btn) => {
    btn.addEventListener("click", () => joinSatellite(btn.dataset.id));
  });
}

async function joinSatellite(satelliteId) {
  try {
    await api(`/satellites/${satelliteId}/enter`, { method: "POST" });
    await refreshContests();
    refreshPortfoliosBalance();
  } catch (err) {
    alert(err.message);
  }
}

let lastKnownBrokersLocked = null;

function triggerBrokerUnlock(newCount) {
  const overlay = document.createElement("div");
  overlay.className = "unlock-overlay";
  overlay.innerHTML = `
    <div class="unlock-flash"></div>
    <div class="unlock-banner">
      <div class="unlock-siren">🚨</div>
      <div class="unlock-title">BROKER #${newCount} UNLOCKED</div>
      <div class="unlock-sub">This week's Main Event now awards ${newCount} Activated Stonk Broker${newCount === 1 ? "" : "s"}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add("unlock-out"), 2400);
  setTimeout(() => overlay.remove(), 3000);
}

function renderWeeklyRoom() {
  const el = document.getElementById("weeklyRoomCard");
  const c = contestsCache.current;

  if (!c) {
    const opens = contestsCache.nextOpensAt
      ? `<b class="countdown-text" data-ends="${contestsCache.nextOpensAt}">${fmtCountdown(contestsCache.nextOpensAt)}</b>`
      : "shortly";
    el.innerHTML = `<div class="table-card weekly-card">
      <div class="table-name">Floor closed for the weekend</div>
      <p style="color:var(--text-dim);font-size:13.5px;">Markets are shut, so the Main Event is too. Next one opens Monday — ${opens}.</p>
    </div>`;
    return;
  }

  if (lastKnownBrokersLocked !== null && c.brokersProjected > lastKnownBrokersLocked) {
    triggerBrokerUnlock(c.brokersProjected);
  }
  lastKnownBrokersLocked = c.brokersProjected;

  const hasTicket = ticketsCache.unredeemedCount > 0;
  const lockedBadge =
    c.brokersProjected > 0
      ? `<div class="brokers-locked-badge"><span class="count">🔒 ${c.brokersProjected}</span><span class="label">Activated Stonk Broker${c.brokersProjected === 1 ? "" : "s"}<br>locked in for this week</span></div>`
      : `<div class="brokers-locked-badge"><span class="count">${c.poolGross.toLocaleString()}</span><span class="label">STONK in the pool —<br>building toward a Broker</span></div>`;

  el.innerHTML = `<div class="table-card weekly-card" data-contest="${c.id}">
    ${lockedBadge}
    <div class="table-card-head">
      <div>
        <div class="table-name">Weekly Stonk Broker Challenge <span class="live-dot">●</span></div>
        <div class="table-duration">${c.entrantCount.toLocaleString()} entries funded · closes Friday</div>
      </div>
      <div class="table-badge ${c.joined ? "joined" : ""}">${c.joined ? "You're in" : "Open now"}</div>
    </div>
    <div class="table-row"><span>Entry</span><span class="fee">${c.entryFee.toLocaleString()} STONK</span></div>
    <div class="table-row"><span>Pool so far</span><span>${c.poolGross.toLocaleString()} STONK</span></div>
    <div class="countdown"><span class="clock">⏱</span> <b class="countdown-text" data-ends="${c.weekEnd}">${fmtCountdown(c.weekEnd)}</b></div>
    ${
      c.joined
        ? `<button class="btn btn-outline" disabled>Already in this week's Main Event</button>`
        : hasTicket
          ? `<button class="btn btn-gold join-btn" data-id="${c.id}" data-use-ticket="1">Use my funded ticket — free entry</button>
             <button class="btn btn-outline join-btn" data-id="${c.id}" style="margin-top:8px;">Pay ${c.entryFee.toLocaleString()} STONK instead</button>`
          : `<button class="btn btn-gold join-btn" data-id="${c.id}">Enter for ${c.entryFee.toLocaleString()} STONK</button>`
    }
    <div class="join-msg" data-msg-for="${c.id}"></div>
  </div>`;

  el.querySelectorAll(".join-btn").forEach((btn) => {
    btn.addEventListener("click", () => joinContest(btn.dataset.id, btn.dataset.useTicket === "1"));
  });
}

async function joinContest(contestId, useTicket) {
  const msgEl = document.querySelector(`[data-msg-for="${contestId}"]`);
  msgEl.textContent = "";
  try {
    await api(`/contests/${contestId}/enter`, { method: "POST", body: JSON.stringify({ useTicket: !!useTicket }) });
    msgEl.style.color = "var(--green)";
    msgEl.textContent = useTicket ? "Ticket redeemed — you're in!" : "You're in! Check My Contests.";
    await refreshContests();
    refreshPortfoliosBalance();
  } catch (err) {
    msgEl.style.color = "var(--red)";
    msgEl.textContent = err.message;
  }
}

// ---------------- My Contests ----------------
async function refreshMyContests() {
  try {
    const portfolios = await api("/portfolios");
    const active = portfolios.filter((p) => p.context.status === "open" || p.context.status === "pending");
    const past = portfolios.filter((p) => p.context.status === "resolved");

    document.getElementById("activePortfoliosList").innerHTML =
      active.map(portfolioRowHtml).join("") ||
      `<div class="history-empty">Nothing active — head to the Lobby to enter a contest.</div>`;
    document.getElementById("pastPortfoliosList").innerHTML =
      past.map(portfolioRowHtml).join("") || `<div class="history-empty">No resolved contests yet.</div>`;

    document.querySelectorAll(".trade-portfolio-btn").forEach((btn) => {
      btn.addEventListener("click", () => openTradeView(btn.dataset.id, btn.dataset.label));
    });
  } catch (err) {
    console.error(err);
  }
}

function portfolioRowHtml(p) {
  const plCls = p.pl >= 0 ? "up" : "down";
  const isActive = p.context.status === "open" || p.context.status === "pending";
  return `<div class="portfolio-row">
    <div class="portfolio-row-main">
      <div class="portfolio-row-label">${p.label}</div>
      <div class="portfolio-row-sub mono">${p.positionCount} position${p.positionCount === 1 ? "" : "s"} · $${p.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
    </div>
    <div class="portfolio-row-pl ${plCls} mono">${p.pl >= 0 ? "+" : "-"}$${Math.abs(p.pl).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
    ${isActive ? `<button class="btn btn-gold btn-sm trade-portfolio-btn" data-id="${p.id}" data-label="${p.label}">Trade</button>` : `<span class="table-badge">Resolved</span>`}
  </div>`;
}

function openTradeView(portfolioId, label) {
  currentPortfolioId = portfolioId;
  document.getElementById("tradeContextLabel").textContent = label;
  switchView("trade");
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
  renderMarketFilter(window.__symbols || []);
  initChart();
  refreshCurrentPortfolio();
}

document.getElementById("backToMyContestsBtn").addEventListener("click", () => switchView("mycontests"));

// ---------------- Trading (scoped to currentPortfolioId) ----------------
function renderMarketFilter(symbols) {
  const exchanges = ["ALL", ...new Set(symbols.map((s) => s.exchange))];
  const el = document.getElementById("marketFilter");
  el.innerHTML = exchanges
    .map((ex) => `<button data-ex="${ex}" class="${ex === "ALL" ? "active" : ""}">${ex}</button>`)
    .join("");
  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedExchangeFilter = btn.dataset.ex;
      renderWatchlist();
    });
  });
}

function renderWatchlist() {
  const symbols = (window.__symbols || []).filter(
    (s) => selectedExchangeFilter === "ALL" || s.exchange === selectedExchangeFilter
  );
  const tbody = document.getElementById("watchlistTable");
  tbody.innerHTML = symbols
    .map((s) => {
      const q = latestQuotes[s.symbol];
      const price = q ? q.price.toFixed(2) : "—";
      const chg = q ? q.changePct : 0;
      const cls = chg >= 0 ? "up" : "down";
      return `<tr class="watch-row" data-symbol="${s.symbol}">
        <td class="mono">${s.symbol}</td><td>${s.exchange}</td><td>${q ? q.currency : ""} ${price}</td>
        <td class="${cls}">${chg >= 0 ? "+" : ""}${chg}%</td></tr>`;
    })
    .join("");
  tbody.querySelectorAll("tr").forEach((row) => row.addEventListener("click", () => selectSymbol(row.dataset.symbol)));
}

function selectSymbol(sym) {
  selectedSymbol = sym;
  document.getElementById("chartSymbolLabel").textContent = sym;
  chartHistory[sym] = chartHistory[sym] || [];
  series.setData(chartHistory[sym]);
}

function initChart() {
  document.getElementById("chartContainer").innerHTML = "";
  chart = LightweightCharts.createChart(document.getElementById("chartContainer"), {
    layout: { background: { color: "transparent" }, textColor: "#7FA36E" },
    grid: { vertLines: { color: "#2A3A24" }, horzLines: { color: "#2A3A24" } },
    timeScale: { timeVisible: true, secondsVisible: true },
    height: 260,
  });
  series = chart.addLineSeries({ color: "#8CFF00", lineWidth: 2 });
}

function pushChartPoint(q) {
  const now = Math.floor(Date.now() / 1000);
  chartHistory[q.symbol] = chartHistory[q.symbol] || [];
  chartHistory[q.symbol].push({ time: now, value: q.price });
  if (chartHistory[q.symbol].length > 300) chartHistory[q.symbol].shift();
  const label = document.getElementById("chartPriceLabel");
  if (label) label.textContent = `${q.currency} ${q.price.toFixed(2)}`;
  if (q.symbol === selectedSymbol && series) series.update({ time: now, value: q.price });
}

document.getElementById("buyBtn").addEventListener("click", () => executeTrade("buy"));
document.getElementById("sellBtn").addEventListener("click", () => executeTrade("sell"));

async function executeTrade(side) {
  if (!currentPortfolioId) return;
  const msg = document.getElementById("tradeMsg");
  const quantity = parseInt(document.getElementById("tradeShares").value, 10);
  try {
    const result = await api(`/portfolios/${currentPortfolioId}/trades`, {
      method: "POST",
      body: JSON.stringify({ symbol: selectedSymbol, side, quantity }),
    });
    msg.textContent = `${side === "buy" ? "Bought" : "Sold"} ${result.quantity} ${result.symbol} @ $${result.price.toFixed(2)}`;
    msg.style.color = side === "buy" ? "var(--green)" : "var(--red)";
    refreshCurrentPortfolio();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "var(--red)";
  }
}

async function refreshCurrentPortfolio() {
  if (!currentPortfolioId) return;
  try {
    const p = await api(`/portfolios/${currentPortfolioId}`);
    document.getElementById("totalValue").textContent = `$${p.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    document.getElementById("cashValue").textContent = `$${p.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const pnlEl = document.getElementById("pnlValue");
    pnlEl.textContent = `${p.pl >= 0 ? "+$" : "-$"}${Math.abs(p.pl).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    pnlEl.style.color = p.pl >= 0 ? "var(--green)" : "var(--red)";

    const tbody = document.getElementById("positionsTable");
    tbody.innerHTML =
      p.positions
        .map((pos) => {
          const cls = pos.unrealizedPL >= 0 ? "up" : "down";
          return `<tr><td class="mono">${pos.symbol}</td><td>${pos.quantity}</td><td>$${pos.avgCost.toFixed(2)}</td><td>$${pos.price.toFixed(2)}</td><td class="${cls}">${pos.unrealizedPL >= 0 ? "+" : ""}$${pos.unrealizedPL.toFixed(2)}</td></tr>`;
        })
        .join("") || `<tr><td colspan="5" style="color:var(--text-dim);">No positions yet — buy something!</td></tr>`;

    renderWatchlist();

    // Context-specific leaderboard
    if (p.context.sourceId) {
      const lb = await api(`/leaderboard/${p.context.type}/${p.context.sourceId}`);
      document.getElementById("contextLeaderboard").innerHTML = leaderboardRowsHtml(lb);
    }
  } catch (err) {
    console.error(err);
  }
}

function leaderboardRowsHtml(rows) {
  return (
    rows
      .map((r) => {
        const cls = r.pl >= 0 ? "up" : "down";
        return `<div class="lb-row">
          <span class="lb-rank ${r.rank === 1 ? "gold" : ""}">${r.rank}</span>
          <span class="lb-name">${r.displayName}</span>
          <span class="lb-pnl ${cls} mono">${r.pl >= 0 ? "+" : "-"}$${Math.abs(r.pl).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>`;
      })
      .join("") || `<div class="history-empty">No entrants yet.</div>`
  );
}

// ---------------- Leaderboards tab ----------------
async function refreshLeaderboards() {
  try {
    const [myStats, lifetime] = await Promise.all([
      token ? api("/leaderboard/me") : Promise.resolve(null),
      api("/leaderboard/lifetime"),
    ]);

    if (myStats) {
      document.getElementById("myStatsCard").innerHTML = `
        <div class="stats-grid">
          <div class="ps-box"><span>Contests played</span><b class="mono">${myStats.contestsPlayed}</b></div>
          <div class="ps-box"><span>Wins</span><b class="mono">${myStats.wins}</b></div>
          <div class="ps-box"><span>Brokers won</span><b class="mono">${myStats.brokersWon}</b></div>
          <div class="ps-box"><span>Tickets won</span><b class="mono">${myStats.ticketsWon}</b></div>
        </div>
        <div class="ps-box" style="margin-top:10px;"><span>Lifetime P&amp;L</span><b class="mono" style="color:${myStats.lifetimePL >= 0 ? "var(--green)" : "var(--red)"};">${myStats.lifetimePL >= 0 ? "+" : "-"}$${Math.abs(myStats.lifetimePL).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b></div>
      `;
    }

    document.getElementById("lifetimeLeaderboardTable").innerHTML =
      lifetime
        .map(
          (r) =>
            `<tr><td>${r.rank}</td><td>${r.displayName}</td><td>${r.contestsPlayed}</td><td>${r.wins}</td><td>${r.brokersWon}</td><td class="${r.lifetimePL >= 0 ? "up" : "down"}">${r.lifetimePL >= 0 ? "+" : "-"}$${Math.abs(r.lifetimePL).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td></tr>`
        )
        .join("") || `<tr><td colspan="6" style="color:var(--text-dim);">No resolved contests yet.</td></tr>`;

    if (contestsCache.current) {
      const lb = await api(`/leaderboard/contest/${contestsCache.current.id}`);
      document.getElementById("mainEventLeaderboard").innerHTML = leaderboardRowsHtml(lb);
    } else {
      document.getElementById("mainEventLeaderboard").innerHTML = `<div class="history-empty">No Main Event open right now.</div>`;
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------------- Referrals ----------------
async function refreshReferrals() {
  try {
    const data = await api("/referrals");
    const link = `${location.origin}/?ref=${data.code}`;
    document.getElementById("referralLinkText").textContent = link;
    document.getElementById("referralCodeInline").textContent = data.code;
    document.getElementById("referredCount").textContent = data.referredCount;
    document.getElementById("totalEarned").textContent = `${data.totalEarned.toLocaleString()} STONK`;

    document.getElementById("referralEarningsTable").innerHTML =
      data.recentEarnings
        .map(
          (e) =>
            `<tr><td>${e.referred_name}</td><td class="up">+${e.amount.toLocaleString()} STONK</td><td>${new Date(e.created_at).toLocaleDateString()}</td></tr>`
        )
        .join("") || `<tr><td colspan="3" style="color:var(--text-dim);">No earnings yet — share your link above.</td></tr>`;
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("copyReferralBtn").addEventListener("click", () => {
  const text = document.getElementById("referralLinkText").textContent;
  navigator.clipboard?.writeText(text);
  const btn = document.getElementById("copyReferralBtn");
  const original = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = original), 1500);
});

// ---------------- Boot ----------------
if (token) showApp();
