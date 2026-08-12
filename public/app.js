// ---------------- Session ----------------
let token = localStorage.getItem("token");
let displayName = localStorage.getItem("displayName");

// If someone arrives via a referral link (?ref=CODE), prefill it and jump
// straight to the signup tab so the code isn't lost before they notice it.
(function prefillReferralFromURL() {
  const params = new URLSearchParams(location.search);
  const ref = params.get("ref");
  if (!ref) return;
  const field = document.getElementById("signupReferral");
  if (field) field.value = ref.toUpperCase();
  // Jump straight to the signup tab (done directly rather than via .click(),
  // since this runs before the tab button listeners are attached below).
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
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A saved login can go stale (e.g. the server's database was reset/updated
    // since you last logged in) — if the server says our session or account
    // is invalid, clear it and bounce back to the login screen instead of
    // showing a confusing error on a broken app state.
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

document.getElementById("heroEnterFloorBtn").addEventListener("click", () => {
  document.getElementById("dailySessionsGrid").scrollIntoView({ behavior: "smooth", block: "start" });
});

function showApp() {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  document.getElementById("welcomeMsg").textContent = `Hey, ${displayName}`;
  boot();
}

// ---------------- App state ----------------
let latestQuotes = {};
let selectedSymbol = "AAPL";
let selectedExchangeFilter = "ALL";
let chart, series;
const chartHistory = {}; // symbol -> array of {time, value}

async function boot() {
  const symbols = await api("/quotes/symbols");
  window.__symbols = symbols;
  renderMarketFilter(symbols);
  initChart();
  connectWebSocket();
  refreshPortfolio();
  refreshLeaderboard();
  refreshContests();
  refreshReferrals();
  setInterval(refreshPortfolio, 4000);
  setInterval(refreshLeaderboard, 5000);
  setInterval(refreshContests, 5000);
  setInterval(tickCountdowns, 1000);
}

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
      renderWatchlist();
      renderPositionsFromCache();
    }
  };
  ws.onclose = () => setTimeout(connectWebSocket, 2000); // auto-reconnect
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
        <td class="mono">${s.symbol}</td>
        <td>${s.exchange}</td>
        <td>${q ? q.currency : ""} ${price}</td>
        <td class="${cls}">${chg >= 0 ? "+" : ""}${chg}%</td>
      </tr>`;
    })
    .join("");
  tbody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => selectSymbol(row.dataset.symbol));
  });
}

function selectSymbol(sym) {
  selectedSymbol = sym;
  document.getElementById("chartSymbolLabel").textContent = sym;
  chartHistory[sym] = chartHistory[sym] || [];
  series.setData(chartHistory[sym]);
}

function initChart() {
  chartContainer.innerHTML = "";
  chart = LightweightCharts.createChart(document.getElementById("chartContainer"), {
    layout: { background: { color: "transparent" }, textColor: "#8A97A3" },
    grid: { vertLines: { color: "#2A343D" }, horzLines: { color: "#2A343D" } },
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
  document.getElementById("chartPriceLabel").textContent = `${q.currency} ${q.price.toFixed(2)}`;
  if (q.symbol === selectedSymbol) series.update({ time: now, value: q.price });
}

// ---------------- Trading ----------------
document.getElementById("buyBtn").addEventListener("click", () => executeTrade("buy"));
document.getElementById("sellBtn").addEventListener("click", () => executeTrade("sell"));

async function executeTrade(side) {
  const msg = document.getElementById("tradeMsg");
  const quantity = parseInt(document.getElementById("tradeShares").value, 10);
  try {
    const result = await api("/trades", {
      method: "POST",
      body: JSON.stringify({ symbol: selectedSymbol, side, quantity }),
    });
    msg.textContent = `${side === "buy" ? "Bought" : "Sold"} ${result.quantity} ${result.symbol} @ $${result.price.toFixed(2)}`;
    msg.style.color = side === "buy" ? "var(--green)" : "var(--red)";
    refreshPortfolio();
  } catch (err) {
    msg.textContent = err.message;
    msg.style.color = "var(--red)";
  }
}

// ---------------- Portfolio ----------------
let latestPortfolio = null;

async function refreshPortfolio() {
  try {
    latestPortfolio = await api("/portfolio");
    renderPortfolioSummary();
    renderPositionsFromCache();
  } catch (err) {
    console.error(err);
  }
}

function renderPortfolioSummary() {
  if (!latestPortfolio) return;
  document.getElementById("totalValue").textContent = `$${latestPortfolio.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  document.getElementById("cashValue").textContent = `$${latestPortfolio.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const pnlEl = document.getElementById("pnlValue");
  const pnl = latestPortfolio.totalPL;
  pnlEl.textContent = `${pnl >= 0 ? "+$" : "-$"}${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  pnlEl.style.color = pnl >= 0 ? "var(--green)" : "var(--red)";
  document.getElementById("navStonkBalance").textContent = latestPortfolio.stonkBalance.toLocaleString();
}

function renderPositionsFromCache() {
  if (!latestPortfolio) return;
  const tbody = document.getElementById("positionsTable");
  tbody.innerHTML = latestPortfolio.positions
    .map((p) => {
      const liveQ = latestQuotes[p.symbol];
      const price = liveQ ? liveQ.price : p.price;
      const pl = (price - p.avgCost) * p.quantity;
      const cls = pl >= 0 ? "up" : "down";
      return `<tr>
        <td class="mono">${p.symbol}</td>
        <td>${p.quantity}</td>
        <td>$${p.avgCost.toFixed(2)}</td>
        <td>$${price.toFixed(2)}</td>
        <td class="${cls}">${pl >= 0 ? "+" : ""}$${pl.toFixed(2)}</td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="5" style="color:var(--text-dim);">No positions yet — buy something!</td></tr>`;
}

// ---------------- Leaderboard ----------------
async function refreshLeaderboard() {
  try {
    const rows = await api("/leaderboard");
    const el = document.getElementById("leaderboard");
    el.innerHTML = rows
      .map((r) => {
        const cls = r.pl >= 0 ? "up" : "down";
        const rankCls = r.rank === 1 ? "gold" : "";
        return `<div class="lb-row">
          <span class="lb-rank ${rankCls}">${r.rank}</span>
          <span class="lb-name">${r.displayName}</span>
          <span class="lb-pnl ${cls}">${r.pl >= 0 ? "+" : "-"}$${Math.abs(r.pl).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error(err);
  }
}

// ---------------- Tab navigation ----------------
document.querySelectorAll(".nav-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
    document.getElementById(`${btn.dataset.view}View`).style.display = "block";
  });
});

// ---------------- Lobby: satellites + Main Event ----------------
let contestsCache = { current: null, nextOpensAt: null, config: {}, history: [] };
let satellitesCache = { tiers: [], history: [] };
let ticketsCache = { unredeemedCount: 0, tickets: [] };

async function refreshContests() {
  try {
    [contestsCache, satellitesCache, ticketsCache] = await Promise.all([
      api("/contests"),
      api("/satellites"),
      token ? api("/tickets") : Promise.resolve({ unredeemedCount: 0, tickets: [] }),
    ]);
    renderLiveStatsBar();
    renderDailySessions();
    renderWeeklyQualifier();
    renderWeeklyRoom();
    renderHistory();
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

  // Hero stats strip (Next Contest / Entries / Brokers Locked)
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

function satelliteCardHtml(s) {
  if (s.status === "pending") {
    const opensDate = new Date(s.opensAt);
    const isToday = opensDate.toDateString() === new Date().toDateString();
    const whenLabel = isToday
      ? `Opens today ${opensDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ET`
      : `Opens ${opensDate.toLocaleDateString([], { weekday: "short" })} ${opensDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ET`;
    return `<div class="table-card pending-card">
      <div class="table-card-head">
        <div>
          <div class="table-name"><span class="session-icon">${s.icon}</span>${s.name}</div>
          <div class="table-duration">${whenLabel}</div>
        </div>
        <div class="table-badge">Scheduled</div>
      </div>
      <div class="table-row"><span>Entry</span><span class="fee">${s.entryFee.toLocaleString()} STONK</span></div>
      <div class="escrow-note">Not open yet — check back when this session's window starts</div>
      <div class="countdown"><span class="clock">⏱</span> <b class="countdown-text" data-ends="${s.opensAt}">${fmtCountdown(s.opensAt)}</b></div>
      <button class="btn btn-outline" disabled>Not open yet</button>
    </div>`;
  }

  const isLocked = s.status !== "open";
  const timeLabel = isLocked
    ? `Locked — resolved`
    : `locks ${new Date(s.locksAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `<div class="table-card">
    <div class="table-card-head">
      <div>
        <div class="table-name"><span class="session-icon">${s.icon}</span>${s.name} ${!isLocked ? '<span class="live-dot">●</span>' : ""}</div>
        <div class="table-duration">${s.entrantCount} traders · ${timeLabel}</div>
      </div>
      <div class="table-badge ${s.joined ? "joined" : ""}">${s.joined ? "You're in" : isLocked ? "Locked" : "Open now"}</div>
    </div>
    <div class="table-row"><span>Entry</span><span class="fee">${s.entryFee.toLocaleString()} STONK</span></div>
    <div class="table-row"><span>Tickets funded</span><span>🎟️ ${s.ticketsProjected}</span></div>
    <div class="escrow-note ${s.ticketsProjected > 0 ? "met" : ""}">${s.ticketsProjected > 0 ? `✓ ${s.ticketsProjected} funded Main Event ticket${s.ticketsProjected === 1 ? "" : "s"} up for grabs` : "Not enough in the pool yet for a ticket — top finisher still wins the pool"}</div>
    ${
      isLocked
        ? `<button class="btn btn-outline" disabled>Locked for this session</button>`
        : `<div class="countdown"><span class="clock">⏱</span> <b class="countdown-text" data-ends="${s.locksAt}">${fmtCountdown(s.locksAt)}</b></div>
           <button class="btn ${s.joined ? "btn-outline" : "btn-gold"} join-sat-btn" data-id="${s.id}" ${s.joined ? "disabled" : ""}>
             ${s.joined ? "Already claimed your seat" : "Claim my seat"}
           </button>`
    }
    <div class="join-msg" data-sat-msg-for="${s.id}"></div>
  </div>`;
}

function renderDailySessions() {
  const el = document.getElementById("dailySessionsGrid");
  const daily = satellitesCache.tiers.filter((t) => t.cadence === "daily");
  if (!daily.length) {
    el.innerHTML = `<div class="history-empty">No daily sessions available.</div>`;
    return;
  }
  el.innerHTML = daily.map(satelliteCardHtml).join("");
  el.querySelectorAll(".join-sat-btn:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => joinSatellite(btn.dataset.id));
  });
}

function renderWeeklyQualifier() {
  const el = document.getElementById("weeklyQualifierCard");
  const q = satellitesCache.tiers.find((t) => t.cadence === "weekly");
  if (!q) {
    el.innerHTML = `<div class="table-card"><div class="table-name">No qualifier available.</div></div>`;
    return;
  }
  el.innerHTML = satelliteCardHtml(q);
  const btn = el.querySelector(".join-sat-btn:not([disabled])");
  if (btn) btn.addEventListener("click", () => joinSatellite(btn.dataset.id));
}

async function joinSatellite(satelliteId) {
  const msgEl = document.querySelector(`[data-sat-msg-for="${satelliteId}"]`);
  msgEl.textContent = "";
  try {
    await api(`/satellites/${satelliteId}/enter`, { method: "POST" });
    msgEl.style.color = "var(--green)";
    msgEl.textContent = "You're in! Head to the Trading Floor.";
    await refreshContests();
    await refreshPortfolio();
  } catch (err) {
    msgEl.style.color = "var(--red)";
    msgEl.textContent = err.message;
  }
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
      <p style="color:var(--text-dim);font-size:13.5px;">Markets are shut, so the Main Event is too. Next one opens Monday — ${opens}. Satellites are still live all weekend.</p>
    </div>`;
    return;
  }

  const hasTicket = ticketsCache.unredeemedCount > 0;
  const lockedBadge =
    c.brokersProjected > 0
      ? `<div class="brokers-locked-badge">
           <span class="count">🔒 ${c.brokersProjected}</span>
           <span class="label">Activated Stonk Broker${c.brokersProjected === 1 ? "" : "s"}<br>locked in for this week</span>
         </div>`
      : `<div class="brokers-locked-badge">
           <span class="count">${c.poolGross.toLocaleString()}</span>
           <span class="label">STONK in the pool —<br>building toward a Broker</span>
         </div>`;
  const ladderNote =
    c.brokersProjected > 0
      ? `<div class="escrow-note met">✓ Next finisher after the locked Brokers still wins the leftover pool in STONK</div>`
      : `<div class="escrow-note">Pool still building — top finisher currently wins the whole pool in STONK until a Broker is funded</div>`;

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
    ${ladderNote}
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
    await api(`/contests/${contestId}/enter`, {
      method: "POST",
      body: JSON.stringify({ useTicket: !!useTicket }),
    });
    msgEl.style.color = "var(--green)";
    msgEl.textContent = useTicket ? "Ticket redeemed — you're in!" : "You're in! Head to the Trading Floor.";
    await refreshContests();
    await refreshPortfolio();
  } catch (err) {
    msgEl.style.color = "var(--red)";
    msgEl.textContent = err.message;
  }
}

function tickCountdowns() {
  document.querySelectorAll(".countdown-text").forEach((el) => {
    el.textContent = fmtCountdown(el.dataset.ends);
  });
}

function renderHistory() {
  const el = document.getElementById("historyList");
  if (!contestsCache.history.length) {
    el.innerHTML = `<div class="history-empty">No closed Main Events yet — this week's is still running.</div>`;
    return;
  }
  el.innerHTML = contestsCache.history
    .map((c) => {
      const closed = c.weekEnd ? new Date(c.weekEnd).toLocaleDateString() : "";
      const brokerLine =
        c.brokersFunded > 0
          ? `🏆 ${c.brokersFunded} Activated Stonk Broker${c.brokersFunded === 1 ? "" : "s"} awarded`
          : `No Broker funded this week`;
      const remainderLine = c.remainderStonk
        ? ` · ${c.remainderDisplayName} took the remaining ${c.remainderStonk.toLocaleString()} STONK`
        : "";
      return `<div class="history-row">
        <div class="history-tier">Week of ${new Date(c.weekStart).toLocaleDateString()}</div>
        <div class="history-meta">${c.entryFee.toLocaleString()} STONK entry · ${c.entrantCount} entries · pool ${c.poolGross?.toLocaleString() || 0} STONK · closed ${closed}</div>
        <div class="history-winner">${brokerLine}${remainderLine}</div>
      </div>`;
    })
    .join("");
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

    const tbody = document.getElementById("referralEarningsTable");
    tbody.innerHTML =
      data.recentEarnings
        .map(
          (e) =>
            `<tr><td>${e.referred_name}</td><td class="up">+${e.amount.toLocaleString()} STONK</td><td>${new Date(e.created_at).toLocaleDateString()}</td></tr>`
        )
        .join("") ||
      `<tr><td colspan="3" style="color:var(--text-dim);">No earnings yet — share your link above.</td></tr>`;
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
