// ---------------- Session ----------------
let token = localStorage.getItem("token");
let displayName = localStorage.getItem("displayName");

(async function showSignupUsdHint() {
  try {
    const res = await fetch("/api/account/price");
    const data = await res.json();
    const el = document.getElementById("signupUsdHint");
    if (el) el.textContent = `(~$${(100000 * data.usdPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })})`;
  } catch (e) {
    console.error(e);
  }
})();

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
  const welcomeEl = document.getElementById("welcomeMsg");
  if (welcomeEl) welcomeEl.textContent = `Hey, ${displayName}`;
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

document.getElementById("navLogoHome").addEventListener("click", () => switchView("lobby"));

function switchView(view) {
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
  const el = document.getElementById(`${view}View`);
  if (el) el.style.display = "block";
  if (view === "mycontests") refreshMyContests();
  if (view === "leaderboards") refreshLeaderboards();
  if (view === "ticketmarket") refreshTicketMarket();
}

// ---------------- App state ----------------
let latestQuotes = {};
let selectedSymbol = "AAPL";
let selectedExchangeFilter = "ALL";
let chart, series;
const chartHistory = {};
const candleHistory = {};
let chartMode = "line"; // 'line' | 'candles'
const CANDLE_BUCKET_SECONDS = 5;
let currentPortfolioId = null;

async function boot() {
  const symbols = await api("/quotes/symbols");
  window.__symbols = symbols;
  connectWebSocket();
  renderTierFilterBar();
  refreshPortfoliosBalance();
  refreshContests();
  refreshReferrals();
  refreshStbPrice();
  setInterval(refreshPortfoliosBalance, 5000);
  setInterval(refreshContests, 5000);
  setInterval(tickCountdowns, 1000);
  setInterval(refreshStbPrice, 15000);
}

async function refreshStbPrice() {
  try {
    const data = await api("/account/price");
    const el = document.getElementById("navStbPrice");
    if (el) el.textContent = `$${data.usdPrice.toFixed(4)}`;
  } catch (e) {
    console.error(e);
  }
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

// ---------------- STONK balance (shown in My Contests, not nav — a trader can have multiple portfolio balances at once) ----------------
async function refreshPortfoliosBalance() {
  try {
    const data = await api("/account");
    const el = document.getElementById("myContestsStonkBalance");
    if (el) el.textContent = data.stonkBalance.toLocaleString();
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
    renderSatelliteCategoryTree();
    if (currentDrilldownCatId) {
      const freshCat = satellitesCache.categories.find((c) => c.id === currentDrilldownCatId);
      if (freshCat) showSatelliteDrilldown(freshCat, false);
    }
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
let currentDrilldownCatId = null;

// Tier filter — which price tiers to show, trader's choice (default: all)
const ALL_TIER_LEVELS = ["free", "low", "mid", "high"];
let tierFilter = new Set(ALL_TIER_LEVELS);

function renderTierFilterBar() {
  const el = document.getElementById("tierFilterBar");
  const labels = { free: "Freeroll", low: "Clerk", mid: "Trader", high: "Jr. Stonkbroker" };
  el.innerHTML =
    `<span class="tier-filter-label">Show:</span>` +
    ALL_TIER_LEVELS.map(
      (level) =>
        `<button class="tier-filter-btn ${tierFilter.has(level) ? "active" : ""}" data-level="${level}">${labels[level]}</button>`
    ).join("") +
    `<button class="tier-filter-btn tier-filter-all" id="tierFilterAllBtn">All</button>`;

  el.querySelectorAll(".tier-filter-btn[data-level]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = btn.dataset.level;
      if (tierFilter.has(level)) {
        if (tierFilter.size > 1) tierFilter.delete(level); // always keep at least one selected
      } else {
        tierFilter.add(level);
      }
      renderTierFilterBar();
      renderSatelliteCategoryTree();
      if (currentDrilldownCatId) {
        const cat = satellitesCache.categories.find((c) => c.id === currentDrilldownCatId);
        if (cat) showSatelliteDrilldown(cat, false);
      }
    });
  });
  document.getElementById("tierFilterAllBtn").addEventListener("click", () => {
    tierFilter = new Set(ALL_TIER_LEVELS);
    renderTierFilterBar();
    renderSatelliteCategoryTree();
    if (currentDrilldownCatId) {
      const cat = satellitesCache.categories.find((c) => c.id === currentDrilldownCatId);
      if (cat) showSatelliteDrilldown(cat, false);
    }
  });
}

const CATEGORY_DESCRIPTIONS = {
  weekly_qualifier: "Runs Monday 12:00am ET through Friday close — the SAME window as the Main Event. Win a room here and you're straight into the Main Event for free.",
  full_day: "Runs the full trading session, 9:30 AM \u2013 4:00 PM ET, every weekday. New room opens each trading day.",
  morning: "Runs the first half of the trading session, 9:30 AM \u2013 1:00 PM ET, every weekday.",
  afternoon: "Runs the second half of the trading session, 1:00 PM \u2013 4:00 PM ET, every weekday.",
};

function renderSatelliteCategoryTree() {
  const el = document.getElementById("satelliteCategoriesTree");
  el.innerHTML = satellitesCache.categories
    .map((cat, i) => {
      const visibleLevels = cat.levels.filter((l) => tierFilter.has(l.priceLevel));
      const openCount = visibleLevels.filter((l) => l.status === "open").length;
      const hasFree = visibleLevels.some((l) => l.priceLevel === "free");
      const tierPreview = visibleLevels
        .map((l) => `${l.priceLevelName || l.priceLevel} ${l.entryFee === 0 ? "FREE" : l.entryFee.toLocaleString()}`)
        .join(" · ");
      if (visibleLevels.length === 0) return "";
      return `<div class="portfolio-row" title="${CATEGORY_DESCRIPTIONS[cat.id] || ""}">
        <div class="portfolio-row-main">
          <div class="portfolio-row-label">${cat.icon} ${cat.name} <span class="cat-tier-preview mono">${tierPreview}</span> ${hasFree ? '<span class="table-badge" style="margin-left:6px;">Free tier available</span>' : ""}</div>
          <div class="portfolio-row-sub mono">${openCount} of ${visibleLevels.length} rooms open now</div>
        </div>
        <button class="btn btn-outline btn-sm lobby-cat-btn" data-idx="${i}">Browse rooms</button>
      </div>`;
    })
    .join("");

  el.querySelectorAll(".lobby-cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => showSatelliteDrilldown(satellitesCache.categories[Number(btn.dataset.idx)]));
  });
}

function showPrizeBreakdown(lvl) {
  if (!lvl) return;
  const rake = Math.round(lvl.poolGross * 0.15);
  const playerPool = lvl.poolGross - rake;
  const ticketsCost = (lvl.ticketsProjected || 0) * (lvl.ticketCost || 3000);
  const lines = [
    `${lvl.name || lvl.priceLevelName} — Prize Pool Breakdown`,
    ``,
    `Entries: ${lvl.entrantCount}`,
    `Gross pool: ${lvl.poolGross.toLocaleString()} STONK`,
    `Platform + affiliate rake (15%): -${rake.toLocaleString()} STONK`,
    `Player pool (85%): ${playerPool.toLocaleString()} STONK`,
    ``,
    `Tickets funded: ${lvl.ticketsProjected || 0} × ${(lvl.ticketCost || 3000).toLocaleString()} STONK = ${ticketsCost.toLocaleString()} STONK`,
    `Remainder to next finisher: ${(lvl.remainderProjected || 0).toLocaleString()} STONK`,
  ];
  alert(lines.join("\n"));
}

function showSatelliteDrilldown(cat, scrollTo = true) {
  currentDrilldownCatId = cat.id;
  document.getElementById("lobbyDrilldownTitle").textContent = `${cat.icon} ${cat.name}`;
  const el = document.getElementById("satelliteCategories");
  const chips = cat.levels
    .filter((lvl) => tierFilter.has(lvl.priceLevel))
    .map((lvl) => {
      const isPending = lvl.status === "pending";
      const isLocked = lvl.status === "resolved";
      const atMax = lvl.myEntryCount >= lvl.maxEntriesPerAccount;
      const chipState = atMax ? "in" : isPending ? "pending" : isLocked ? "locked" : "";
      const countdown = isPending
        ? `<span class="countdown-text" data-ends="${lvl.opensAt}">${fmtCountdown(lvl.opensAt)}</span>`
        : null;
      const statusLine = atMax
        ? "Max entries reached"
        : isPending
          ? `0 entries · ${countdown}`
          : isLocked
            ? "Locked"
            : `${lvl.entrantCount} entries`;
      const ticketLine = !isLocked
        ? `<span class="stake-tickets">🎟️ ${lvl.ticketsProjected ?? 0} funded <span class="breakdown-btn" data-breakdown-id="${lvl.id}">ⓘ breakdown</span></span>`
        : "";
      const feeLabel = lvl.entryFee === 0 ? "FREE" : `${lvl.entryFee.toLocaleString()} STONK`;
      const usdLabel = lvl.entryFee === 0 ? "no wallet needed" : `~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"}`;
      // Pending rooms show a real Enter/Join button too — clicking reserves
      // your spot right away (100% cash, no picks yet). Set up the actual
      // portfolio anytime before that room opens, from My Contests.
      const clickAction = atMax || isLocked ? "" : isPending ? "reserve-room-btn" : "join-sat-row-btn";
      const disabled = atMax || isLocked;
      const hoverStats = !isPending
        ? `${lvl.entrantCount} traders · ${lvl.poolGross.toLocaleString()} STONK collected · projected: ${lvl.ticketsProjected || 0} ticket(s) + ${(lvl.remainderProjected || 0).toLocaleString()} STONK remainder`
        : `Opens ${new Date(lvl.opensAt).toLocaleString()}`;
      return `<button class="stake-chip ${chipState} ${clickAction}" ${disabled ? "disabled" : ""} title="${hoverStats}" data-id="${lvl.id}" data-tier="${lvl.tierId}" data-level="${lvl.priceLevel}">
        <span class="stake-tier-name">${lvl.priceLevelName || lvl.priceLevel}</span>
        <span class="stake-fee">${feeLabel} <span class="stake-fee-usd">(${usdLabel})</span></span>
        <span class="stake-sub">${statusLine}</span>
        ${lvl.myEntryCount > 0 ? `<span class="stake-entry-counter">You've entered ${lvl.myEntryCount}/${lvl.maxEntriesPerAccount} time${lvl.myEntryCount === 1 ? "" : "s"}</span>` : ""}
        ${ticketLine}
        ${!disabled ? `<span class="stake-alloc-hint">${isPending ? "Enter Contest (reserve)" : "Enter Contest"} ›</span>` : ""}
      </button>`;
    })
    .join("");
  el.innerHTML = `<div class="stake-chips">${chips}</div>`;

  el.querySelectorAll(".breakdown-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showPrizeBreakdown(cat.levels.find((l) => l.id == btn.dataset.breakdownId));
    });
  });
  el.querySelectorAll(".join-sat-row-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lvl = cat.levels.find((l) => l.id == btn.dataset.id);
      if (!lvl) return;
      const remaining = lvl.maxEntriesPerAccount - lvl.myEntryCount;
      showEntryReview({
        badge: "ENTER SATELLITE",
        title: lvl.name,
        category: cat.name,
        tier: lvl.priceLevelName || lvl.priceLevel,
        entryNumber: `${lvl.myEntryCount + 1} of ${lvl.maxEntriesPerAccount}`,
        feeLabel: "Entry fee",
        feeText: lvl.entryFee === 0 ? "FREE — no wallet needed" : `${lvl.entryFee.toLocaleString()} STONK (~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"})`,
        feeEach: lvl.entryFee,
        maxQty: remaining,
        note: `${lvl.entrantCount} traders already in this room. ${lvl.ticketsProjected || 0} ticket(s) currently funded.`,
        onConfirm: (qty) => joinSatellite(lvl.id, qty),
      });
    });
  });
  el.querySelectorAll(".reserve-room-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lvl = cat.levels.find((l) => l.tierId === btn.dataset.tier && l.priceLevel === btn.dataset.level);
      if (!lvl) return;
      const remaining = lvl.maxEntriesPerAccount - lvl.myEntryCount;
      showEntryReview({
        badge: "RESERVE YOUR SPOT",
        title: lvl.name,
        category: cat.name,
        tier: lvl.priceLevelName || lvl.priceLevel,
        entryNumber: `${lvl.myEntryCount + 1} of ${lvl.maxEntriesPerAccount}`,
        feeLabel: "Entry fee (charged on open)",
        feeText: lvl.entryFee === 0 ? "FREE — no wallet needed" : `${lvl.entryFee.toLocaleString()} STONK (~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"})`,
        feeEach: lvl.entryFee,
        maxQty: remaining,
        note: "This room hasn't opened yet — reserving locks your spot now. Set up your picks anytime before it opens, from My Contests.",
        onConfirm: (qty) => reserveRoom(btn.dataset.tier, btn.dataset.level, qty),
      });
    });
  });

  document.getElementById("lobbyDrilldownPanel").style.display = "block";
  if (scrollTo) document.getElementById("lobbyDrilldownPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
document.getElementById("closeLobbyDrilldown").addEventListener("click", () => {
  currentDrilldownCatId = null;
  document.getElementById("lobbyDrilldownPanel").style.display = "none";
});

let pendingEntryConfirm = null;

function showEntryReview({ badge, title, category, tier, entryNumber, feeLabel, feeText, feeEach, note, maxQty, onConfirm }) {
  document.getElementById("entryReviewBadge").textContent = badge;
  document.getElementById("entryReviewTitle").textContent = title;
  document.getElementById("entryReviewCategory").textContent = category;
  document.getElementById("entryReviewTier").textContent = tier;
  document.getElementById("entryReviewNumber").textContent = entryNumber;
  document.getElementById("entryReviewFeeLabel").textContent = feeLabel;
  document.getElementById("entryReviewFee").textContent = feeText;
  document.getElementById("entryReviewNote").textContent = note || "";

  const qtyRow = document.getElementById("entryReviewQtyRow");
  const qtySelect = document.getElementById("entryReviewQty");
  const qtyTotal = document.getElementById("entryReviewQtyTotal");
  // Quantity picker only shows when more than one entry is actually
  // possible right now — never for freeroll (maxQty will be 1 there,
  // since freeroll is hard-capped to a single entry per account).
  if (maxQty > 1) {
    qtySelect.innerHTML = Array.from({ length: maxQty }, (_, i) => i + 1)
      .map((n) => `<option value="${n}">${n}</option>`)
      .join("");
    qtySelect.value = "1";
    qtyRow.style.display = "block";
    const updateTotal = () => {
      const n = Number(qtySelect.value);
      qtyTotal.textContent = feeEach > 0 ? `Total: ${(feeEach * n).toLocaleString()} STONK` : "";
    };
    qtySelect.oninput = updateTotal;
    updateTotal();
  } else {
    qtyRow.style.display = "none";
  }

  pendingEntryConfirm = onConfirm;
  document.getElementById("entryReviewModal").style.display = "flex";
}
function closeEntryReview() {
  pendingEntryConfirm = null;
  document.getElementById("entryReviewModal").style.display = "none";
}
document.getElementById("entryReviewClose").addEventListener("click", closeEntryReview);
document.getElementById("entryReviewBackdrop").addEventListener("click", closeEntryReview);
document.getElementById("entryReviewCancelBtn").addEventListener("click", closeEntryReview);
document.getElementById("entryReviewConfirmBtn").addEventListener("click", () => {
  const fn = pendingEntryConfirm;
  const qty = document.getElementById("entryReviewQtyRow").style.display !== "none" ? Number(document.getElementById("entryReviewQty").value) : 1;
  closeEntryReview();
  if (fn) fn(qty);
});

function showYoureIn(title, message) {
  document.getElementById("youreInTitle").textContent = title;
  document.getElementById("youreInMessage").textContent = message;
  document.getElementById("youreInModal").style.display = "flex";
}
function closeYoureIn() {
  document.getElementById("youreInModal").style.display = "none";
}
document.getElementById("youreInDoneBtn").addEventListener("click", closeYoureIn);
document.getElementById("youreInModalBackdrop").addEventListener("click", closeYoureIn);

// Runs entries ONE AT A TIME (never in parallel) — parallel requests could
// all pass the server's "count < max" check simultaneously and race past
// the cap. Sequential + awaited keeps the max-10 (or max-1 for freeroll)
// limit airtight no matter how many are requested at once.
async function joinSatellite(satelliteId, qty = 1) {
  let succeeded = 0;
  try {
    for (let i = 0; i < qty; i++) {
      await api(`/satellites/${satelliteId}/enter`, { method: "POST" });
      succeeded++;
    }
    await refreshContests();
    refreshPortfoliosBalance();
    showYoureIn(
      succeeded === 1 ? "You're in!" : `You're in — ${succeeded} entries!`,
      "Head to My Contests to trade — each entry's own $100,000 portfolio is ready for you."
    );
  } catch (err) {
    await refreshContests();
    refreshPortfoliosBalance();
    alert(succeeded > 0 ? `Got ${succeeded} in before hitting: ${err.message}` : err.message);
  }
}

// Reserving a room that hasn't opened yet — creates an empty (100% cash)
// pending allocation. No picks required now; set up the actual portfolio
// anytime before the room opens, from My Contests.
async function reserveRoom(tierId, priceLevel, qty = 1) {
  let succeeded = 0;
  try {
    for (let i = 0; i < qty; i++) {
      await api("/allocations", {
        method: "POST",
        body: JSON.stringify({ targetType: "satellite", tierId, priceLevel, allocations: [] }),
      });
      succeeded++;
    }
    await refreshContests();
    await refreshMyContests();
    showYoureIn(
      succeeded === 1 ? "You're in!" : `You're in — ${succeeded} spots reserved!`,
      "Set up each portfolio anytime before this room opens — it'll auto-fill with your picks the instant it does."
    );
  } catch (err) {
    await refreshContests();
    await refreshMyContests();
    alert(succeeded > 0 ? `Reserved ${succeeded} before hitting: ${err.message}` : err.message);
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
      <div class="table-badge ${c.joined ? "joined" : ""}">${c.joined ? `You're in (${c.myEntryCount}/${c.maxEntriesPerAccount})` : "Open now"}</div>
    </div>
    <div class="table-row"><span>Entry</span><span class="fee">${c.entryFee.toLocaleString()} STONK <span style="color:var(--text-dim);font-weight:400;">(~$${c.entryFeeUsd?.toFixed(2) ?? "0.00"})</span></span></div>
    <div class="table-row"><span>Pool so far</span><span>${c.poolGross.toLocaleString()} STONK</span></div>
    <div class="countdown"><span class="clock">⏱</span> <b class="countdown-text" data-ends="${c.weekEnd}">${fmtCountdown(c.weekEnd)}</b></div>
    ${
      c.myEntryCount >= c.maxEntriesPerAccount
        ? `<button class="btn btn-outline" disabled>Max ${c.maxEntriesPerAccount} entries reached</button>`
        : hasTicket
          ? `<button class="btn btn-gold join-btn" data-id="${c.id}" data-use-ticket="1">Enter Contest — free (funded ticket)</button>
             <button class="btn btn-outline join-btn" data-id="${c.id}" style="margin-top:8px;">Enter Contest — ${c.entryFee.toLocaleString()} STONK (~$${c.entryFeeUsd?.toFixed(2) ?? "0.00"}) instead</button>`
          : `<button class="btn btn-gold join-btn" data-id="${c.id}">Enter Contest — ${c.entryFee.toLocaleString()} STONK (~$${c.entryFeeUsd?.toFixed(2) ?? "0.00"})</button>`
    }
    <div class="join-msg" data-msg-for="${c.id}"></div>
  </div>`;

  el.querySelectorAll(".join-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const useTicket = btn.dataset.useTicket === "1";
      const remaining = c.maxEntriesPerAccount - c.myEntryCount;
      showEntryReview({
        badge: "ENTER THE MAIN EVENT",
        title: "Weekly Stonk Broker Challenge",
        category: "Main Event",
        tier: useTicket ? "Ticket redemption" : "Direct entry",
        entryNumber: `${c.myEntryCount + 1} of ${c.maxEntriesPerAccount}`,
        feeLabel: useTicket ? "Cost" : "Entry fee",
        feeText: useTicket ? "FREE — funded ticket" : `${c.entryFee.toLocaleString()} STONK (~$${c.entryFeeUsd?.toFixed(2) ?? "0.00"})`,
        feeEach: useTicket ? 0 : c.entryFee,
        maxQty: useTicket ? 1 : remaining, // multi-entry only applies to paying directly, not ticket redemption
        note: `${c.entrantCount.toLocaleString()} entries funded so far. Closes Friday.`,
        onConfirm: (qty) => joinContest(btn.dataset.id, useTicket, qty),
      });
    });
  });
}

async function joinContest(contestId, useTicket, qty = 1) {
  const msgEl = document.querySelector(`[data-msg-for="${contestId}"]`);
  msgEl.textContent = "";
  let succeeded = 0;
  const total = useTicket ? 1 : qty; // ticket redemption never multiplies, regardless of qty passed in
  try {
    for (let i = 0; i < total; i++) {
      await api(`/contests/${contestId}/enter`, { method: "POST", body: JSON.stringify({ useTicket: !!useTicket }) });
      succeeded++;
    }
    msgEl.style.color = "var(--green)";
    msgEl.textContent = useTicket ? "Ticket redeemed — you're in!" : `You're in! (${succeeded} ${succeeded === 1 ? "entry" : "entries"})`;
    await refreshContests();
    refreshPortfoliosBalance();
    showYoureIn(
      succeeded === 1 ? "You're in!" : `You're in — ${succeeded} entries!`,
      useTicket ? "Your ticket got you a free seat in this week's Main Event." : "You're entered in this week's Main Event — good luck out there."
    );
  } catch (err) {
    msgEl.style.color = "var(--red)";
    msgEl.textContent = succeeded > 0 ? `Got ${succeeded} in before hitting: ${err.message}` : err.message;
    await refreshContests();
    refreshPortfoliosBalance();
  }
}

// ---------------- My Contests ----------------
let allocationsCache = [];

function groupEntriesByRoom(portfolios, allocations) {
  const groups = {};

  portfolios.forEach((p) => {
    const key = `portfolio:${p.context.type}:${p.context.sourceId}`;
    if (!groups[key]) {
      groups[key] = { label: p.label.replace(/\s*\(Entry \d+\)\s*$/, ""), items: [] };
    }
    groups[key].items.push({ kind: "portfolio", data: p });
  });

  allocations
    .filter((a) => a.status !== "cancelled")
    .forEach((a) => {
      const key = `pending:${a.targetType}:${a.targetTierId}:${a.targetPriceLevel}`;
      const label = a.targetType === "contest" ? "Main Event" : `${a.targetTierId.replace("_", " ")} — ${a.targetPriceLevel}`;
      if (!groups[key]) groups[key] = { label, items: [] };
      groups[key].items.push({ kind: "pending", data: a });
    });

  return Object.entries(groups).map(([key, g]) => ({ key, ...g }));
}

function renderEntryGroup(group) {
  // Unconfigured = a pending reservation with zero picks saved yet — these
  // stay individually visible always, so they can never get buried and
  // forgotten. Configured = has real picks, or is an already-open real
  // portfolio — these collapse into a tree if there's more than one.
  const isUnconfigured = (item) => item.kind === "pending" && item.data.allocations.length === 0;
  const unconfigured = group.items.filter(isUnconfigured);
  const configured = group.items.filter((item) => !isUnconfigured(item));

  const unconfiguredHtml = unconfigured
    .map((item, i) => {
      const label = group.items.length > 1 ? `<div class="entry-number-tag">New entry</div>` : "";
      return `<div class="entry-group-item unconfigured-entry">${label}${allocationRowHtml(item.data)}</div>`;
    })
    .join("");

  let configuredHtml = "";
  if (configured.length === 1) {
    const item = configured[0];
    configuredHtml = item.kind === "portfolio" ? portfolioRowHtml(item.data) : allocationRowHtml(item.data);
  } else if (configured.length > 1) {
    configuredHtml = `<div class="entry-group">
      <div class="portfolio-row entry-group-summary" data-group-key="${group.key}">
        <div class="portfolio-row-main">
          <div class="portfolio-row-label" style="text-transform:capitalize;">${group.label}</div>
          <div class="portfolio-row-sub mono">${configured.length} configured entries — click to view each</div>
        </div>
        <span class="table-badge expand-caret">▾ expand</span>
      </div>
      <div class="entry-group-items" data-group-items="${group.key}" style="display:none;">
        ${configured
          .map(
            (item, i) =>
              `<div class="entry-group-item"><div class="entry-number-tag">Entry ${i + 1}</div>${
                item.kind === "portfolio" ? portfolioRowHtml(item.data) : allocationRowHtml(item.data)
              }</div>`
          )
          .join("")}
      </div>
    </div>`;
  }

  return unconfiguredHtml + configuredHtml;
}

function scheduledOrderRowHtml(o) {
  const items = o.allocations.map((x) => `${x.symbol} ${x.percent}%`).join(", ") || "No picks set";
  return `<div class="portfolio-row">
    <div class="portfolio-row-main">
      <div class="portfolio-row-label">Fires at ${new Date(o.targetOpenAt).toLocaleString()}</div>
      <div class="portfolio-row-sub mono">${items}</div>
    </div>
    <span class="table-badge">Queued</span>
    <button class="btn btn-outline btn-sm cancel-scheduled-btn" data-id="${o.id}">Cancel</button>
  </div>`;
}

async function cancelScheduledOrder(id) {
  try {
    await api(`/scheduled-orders/${id}`, { method: "DELETE" });
    refreshMyContests();
  } catch (err) {
    alert(err.message);
  }
}

async function refreshMyContests() {
  try {
    const [portfolios, allocations, scheduledOrders] = await Promise.all([
      api("/portfolios"),
      api("/allocations"),
      api("/scheduled-orders"),
    ]);
    allocationsCache = allocations;
    const activePortfolios = portfolios.filter((p) => p.context.status === "open" || p.context.status === "pending");
    const past = portfolios.filter((p) => p.context.status === "resolved");
    const pendingAllocs = allocations.filter((a) => a.status !== "cancelled");

    const groups = groupEntriesByRoom(activePortfolios, pendingAllocs);
    document.getElementById("activePortfoliosList").innerHTML =
      groups.map(renderEntryGroup).join("") ||
      `<div class="history-empty">Nothing active — head to the Lobby to enter a contest.</div>`;
    document.getElementById("pastPortfoliosList").innerHTML =
      past.map(portfolioRowHtml).join("") || `<div class="history-empty">No resolved contests yet.</div>`;

    const activeScheduled = scheduledOrders.filter((o) => o.status === "pending");
    document.getElementById("scheduledOrdersList").innerHTML =
      activeScheduled.map(scheduledOrderRowHtml).join("") ||
      `<div class="history-empty">No orders queued for the next market open.</div>`;
    document.querySelectorAll(".cancel-scheduled-btn").forEach((btn) => {
      btn.addEventListener("click", () => cancelScheduledOrder(btn.dataset.id));
    });

    document.querySelectorAll(".entry-group-summary").forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        const items = document.querySelector(`[data-group-items="${row.dataset.groupKey}"]`);
        const caret = row.querySelector(".expand-caret");
        const isOpen = items.style.display !== "none";
        items.style.display = isOpen ? "none" : "block";
        if (caret) caret.textContent = isOpen ? "▾ expand" : "▴ collapse";
      });
    });
    document.querySelectorAll(".adjust-alloc-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        editPendingAllocation(btn.dataset.id);
      });
    });
    document.querySelectorAll(".editable-alloc-row").forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        editPendingAllocation(row.dataset.allocId);
      });
    });
    document.querySelectorAll(".trade-portfolio-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTradeView(btn.dataset.id, btn.dataset.label);
      });
    });
    document.querySelectorAll(".schedule-order-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openScheduledOrderModal(btn.dataset.id, btn.dataset.label);
      });
    });
    document.querySelectorAll(".cancel-alloc-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cancelAllocation(btn.dataset.id);
      });
    });
  } catch (err) {
    console.error(err);
  }
}

function allocationRowHtml(a) {
  const targetLabel =
    a.targetType === "contest"
      ? "Main Event"
      : `${a.targetTierId.replace("_", " ")} — ${a.targetPriceLevel}`;
  const hasPicks = a.allocations.length > 0;
  const items = hasPicks
    ? a.allocations.map((x) => `${x.symbol} ${x.percent}%`).join(", ")
    : "Reserved — no picks yet, 100% cash. Set up your portfolio before this room opens.";
  const statusBadge =
    a.status === "pending"
      ? `<span class="table-badge">Waiting for open</span>`
      : a.status === "applied"
        ? `<span class="table-badge joined">Filled ✓</span>`
        : `<span class="table-badge" style="opacity:.6;">Failed: ${a.failReason || ""}</span>`;
  const isPending = a.status === "pending";
  return `<div class="portfolio-row ${isPending ? "editable-alloc-row" : ""}" ${isPending ? `data-alloc-id="${a.id}"` : ""}>
    <div class="portfolio-row-main">
      <div class="portfolio-row-label" style="text-transform:capitalize;">${targetLabel}</div>
      <div class="portfolio-row-sub mono">${items}</div>
    </div>
    ${statusBadge}
    ${
      isPending
        ? `<button class="btn ${hasPicks ? "btn-outline" : "btn-gold"} btn-sm adjust-alloc-btn" data-id="${a.id}">${hasPicks ? "Adjust" : "⚙️ Set up portfolio"}</button>
           <button class="btn btn-outline btn-sm cancel-alloc-btn" data-id="${a.id}">Cancel</button>`
        : ""
    }
  </div>`;
}

let editingAllocationId = null;

function editPendingAllocation(id) {
  const alloc = allocationsCache.find((a) => a.id === Number(id));
  if (!alloc) return;
  const targetValue =
    alloc.targetType === "contest" ? "contest::" : `satellite:${alloc.targetTierId}:${alloc.targetPriceLevel}`;
  openAllocationModal(targetValue); // resets editingAllocationId to null internally — must set it AFTER this call, not before
  editingAllocationId = alloc.id;
  document.getElementById("allocTargetSelect").disabled = true; // editing an existing reservation — the room it targets can't change
  // openAllocationModal already opened with 10 default rows — if this
  // reservation actually has real picks saved, clear those defaults and
  // show the real ones instead. If it's a pure reservation (empty
  // allocations, just holding a spot), leave the 10 defaults as a helpful
  // starting point rather than showing an empty modal.
  if (alloc.allocations.length > 0) {
    document.getElementById("allocationRows").innerHTML = "";
    allocRowCount = 0;
    alloc.allocations.forEach((a) => addAllocRow(a.symbol, a.percent));
  }
  document.getElementById("allocationModalIntro").textContent =
    "You can set up your portfolio anytime before this room opens — it fires automatically at the opening price.";
}

async function cancelAllocation(id) {
  try {
    await api(`/allocations/${id}`, { method: "DELETE" });
    refreshMyContests();
  } catch (err) {
    alert(err.message);
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
    ${isActive ? `<button class="btn btn-outline btn-sm schedule-order-btn" data-id="${p.id}" data-label="${p.label}">Schedule open order</button>` : ""}
    ${isActive ? `<button class="btn btn-gold btn-sm trade-portfolio-btn" data-id="${p.id}" data-label="${p.label}">Trade</button>` : `<span class="table-badge">Resolved</span>`}
  </div>`;
}

function openTradeView(portfolioId, label) {
  currentPortfolioId = portfolioId;
  document.getElementById("tradeContextLabel").textContent = label;
  switchView("trade");
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
  renderMarketFilter(window.__symbols || []);
  refreshCurrentPortfolio();
}

document.getElementById("backToMyContestsBtn").addEventListener("click", () => switchView("mycontests"));

// ---------------- Trade popup modal ----------------
function openTradeModal(sym) {
  selectedSymbol = sym;
  document.getElementById("chartSymbolLabel").textContent = sym;
  document.getElementById("tradeModal").style.display = "flex";
  showTradeModalState("main");
  initChart(); // fresh chart each open — avoids sizing issues on a container that was hidden
  chartHistory[sym] = chartHistory[sym] || [];
  candleHistory[sym] = candleHistory[sym] || [];
  series.setData(chartMode === "candles" ? candleHistory[sym] : chartHistory[sym]);
  const q = latestQuotes[sym];
  if (q) {
    document.getElementById("chartPriceLabel").textContent = `${q.currency} ${q.price.toFixed(2)}`;
    updateDayRange(q);
  }
  document.getElementById("tradeMsg").textContent = "";
  updatePctHints();
}

function updateDayRange(q) {
  const el = document.getElementById("dayRangeLabel");
  if (!el || q.sessionLow == null || q.sessionHigh == null) return;
  el.textContent = `Day range: ${q.currency} ${q.sessionLow.toFixed(2)} – ${q.sessionHigh.toFixed(2)}`;
}

function showTradeModalState(state) {
  document.getElementById("tradeModalMain").style.display = state === "main" ? "block" : "none";
  document.getElementById("tradeModalReview").style.display = state === "review" ? "block" : "none";
  document.getElementById("tradeModalFilled").style.display = state === "filled" ? "block" : "none";
}

function closeTradeModal() {
  document.getElementById("tradeModal").style.display = "none";
}
document.getElementById("tradeModalClose").addEventListener("click", closeTradeModal);
document.getElementById("tradeModalBackdrop").addEventListener("click", closeTradeModal);

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

let lastKnownPrices = {};

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
        <td class="mono">${s.symbol}</td><td>${s.exchange}</td><td class="mono price-cell" data-symbol="${s.symbol}">${q ? q.currency : ""} ${price}</td>
        <td class="${cls}">${chg >= 0 ? "+" : ""}${chg}%</td></tr>`;
    })
    .join("");

  tbody.querySelectorAll(".price-cell").forEach((cell) => {
    const sym = cell.dataset.symbol;
    const q = latestQuotes[sym];
    if (q && lastKnownPrices[sym] != null && q.price !== lastKnownPrices[sym]) {
      const dir = q.price > lastKnownPrices[sym] ? "flash-up" : "flash-down";
      cell.classList.add(dir);
      setTimeout(() => cell.classList.remove(dir), 500);
    }
    if (q) lastKnownPrices[sym] = q.price;
  });

  tbody.querySelectorAll("tr").forEach((row) => row.addEventListener("click", () => openTradeModal(row.dataset.symbol)));
}

function selectSymbol(sym) {
  openTradeModal(sym);
}

function initChart() {
  document.getElementById("chartContainer").innerHTML = "";
  chart = LightweightCharts.createChart(document.getElementById("chartContainer"), {
    layout: { background: { color: "transparent" }, textColor: "#7FA36E" },
    grid: { vertLines: { color: "#2A3A24" }, horzLines: { color: "#2A3A24" } },
    timeScale: { timeVisible: true, secondsVisible: true },
    height: 260,
  });
  if (chartMode === "candles") {
    series = chart.addCandlestickSeries({
      upColor: "#3ADC84",
      downColor: "#FF5C6C",
      borderVisible: false,
      wickUpColor: "#3ADC84",
      wickDownColor: "#FF5C6C",
    });
  } else {
    series = chart.addLineSeries({ color: "#8CFF00", lineWidth: 2 });
  }
}

function setChartMode(mode) {
  chartMode = mode;
  document.querySelectorAll(".chart-mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  initChart();
  const data = mode === "candles" ? candleHistory[selectedSymbol] || [] : chartHistory[selectedSymbol] || [];
  series.setData(data);
}
document.querySelectorAll(".chart-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setChartMode(btn.dataset.mode));
});

function pushChartPoint(q) {
  const now = Math.floor(Date.now() / 1000);

  chartHistory[q.symbol] = chartHistory[q.symbol] || [];
  chartHistory[q.symbol].push({ time: now, value: q.price });
  if (chartHistory[q.symbol].length > 300) chartHistory[q.symbol].shift();

  // Bucket ticks into OHLC candles for the candlestick view.
  candleHistory[q.symbol] = candleHistory[q.symbol] || [];
  const bucket = Math.floor(now / CANDLE_BUCKET_SECONDS) * CANDLE_BUCKET_SECONDS;
  const candles = candleHistory[q.symbol];
  const last = candles[candles.length - 1];
  if (last && last.time === bucket) {
    last.high = Math.max(last.high, q.price);
    last.low = Math.min(last.low, q.price);
    last.close = q.price;
  } else {
    candles.push({ time: bucket, open: q.price, high: q.price, low: q.price, close: q.price });
    if (candles.length > 300) candles.shift();
  }

  const label = document.getElementById("chartPriceLabel");
  if (label && q.symbol === selectedSymbol) {
    const prevText = label.textContent;
    const prevPrice = parseFloat(prevText.replace(/[^0-9.-]/g, ""));
    label.textContent = `${q.currency} ${q.price.toFixed(2)}`;
    if (!isNaN(prevPrice) && prevPrice !== q.price) {
      const dir = q.price > prevPrice ? "flash-up" : "flash-down";
      label.classList.add(dir);
      setTimeout(() => label.classList.remove(dir), 500);
    }
    updateDayRange(q);
  }
  if (q.symbol === selectedSymbol && series) {
    if (chartMode === "candles") {
      const c = candleHistory[q.symbol][candleHistory[q.symbol].length - 1];
      series.update(c);
    } else {
      series.update({ time: now, value: q.price });
    }
  }
}

document.getElementById("buyBtn").addEventListener("click", () => initiateTrade("buy"));
document.getElementById("sellBtn").addEventListener("click", () => initiateTrade("sell"));

const CLIENT_MAX_POSITION_PCT = 0.10; // must match server's MAX_INITIAL_POSITION_PCT in routes/portfolios.js
let latestPortfolioData = null;
let pendingTrade = null;

function initiateTrade(side, explicitQuantity) {
  if (!currentPortfolioId) return;
  const msg = document.getElementById("tradeMsg");
  const quantity = explicitQuantity != null ? explicitQuantity : parseInt(document.getElementById("tradeShares").value, 10);
  if (!quantity || quantity <= 0) {
    msg.textContent = "Enter a valid quantity or percentage first.";
    msg.style.color = "var(--red)";
    return;
  }
  const q = latestQuotes[selectedSymbol];
  const estPrice = q ? q.price : 0;
  pendingTrade = { side, quantity, symbol: selectedSymbol, estPrice };

  document.getElementById("reviewAction").textContent = side === "buy" ? "Buy" : "Sell";
  document.getElementById("reviewAction").style.color = side === "buy" ? "var(--green)" : "var(--red)";
  document.getElementById("reviewSymbol").textContent = selectedSymbol;
  document.getElementById("reviewShares").textContent = quantity.toFixed(4).replace(/\.?0+$/, "");
  document.getElementById("reviewPrice").textContent = q ? `${q.currency} ${estPrice.toFixed(2)}` : "—";
  document.getElementById("reviewTotal").textContent = `$${(quantity * estPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  showTradeModalState("review");
}

document.getElementById("reviewCancelBtn").addEventListener("click", () => {
  pendingTrade = null;
  showTradeModalState("main");
});

document.getElementById("reviewConfirmBtn").addEventListener("click", async () => {
  if (!pendingTrade) return;
  const msg = document.getElementById("tradeMsg");
  try {
    const result = await api(`/portfolios/${currentPortfolioId}/trades`, {
      method: "POST",
      body: JSON.stringify({ symbol: pendingTrade.symbol, side: pendingTrade.side, quantity: pendingTrade.quantity }),
    });
    const qtyDisplay = (result.quantity.toFixed ? result.quantity.toFixed(4) : result.quantity).toString().replace(/\.?0+$/, "");
    document.getElementById("filledSummary").textContent =
      `${result.side === "buy" ? "Bought" : "Sold"} ${qtyDisplay} ${result.symbol} @ $${result.price.toFixed(2)}`;
    showTradeModalState("filled");
    pendingTrade = null;
    refreshCurrentPortfolio();
  } catch (err) {
    showTradeModalState("main");
    msg.textContent = err.message;
    msg.style.color = "var(--red)";
  }
});

document.getElementById("filledDoneBtn").addEventListener("click", () => {
  document.getElementById("tradeMsg").textContent = "";
  showTradeModalState("main");
});

function currentAllotmentInfo() {
  if (!latestPortfolioData) return { availableAllotment: 0, existingQty: 0 };
  const maxAllowed = latestPortfolioData.totalValue * CLIENT_MAX_POSITION_PCT;
  const existingPos = latestPortfolioData.positions.find((p) => p.symbol === selectedSymbol);
  const existingCostBasis = existingPos ? existingPos.avgCost * existingPos.quantity : 0;
  const availableAllotment = Math.max(0, maxAllowed - existingCostBasis);
  return { availableAllotment, existingQty: existingPos ? existingPos.quantity : 0 };
}

function updatePctHints() {
  const { availableAllotment, existingQty } = currentAllotmentInfo();
  const buyHint = document.getElementById("buyAllotmentHint");
  const sellHint = document.getElementById("sellPositionHint");
  if (buyHint) buyHint.textContent = `(~$${availableAllotment.toFixed(2)} left)`;
  if (sellHint) sellHint.textContent = `(${existingQty.toFixed(4)} shares held)`;
}

function buyPercentOfAllotment(pct) {
  const q = latestQuotes[selectedSymbol];
  if (!q) return;
  const { availableAllotment } = currentAllotmentInfo();
  const cost = availableAllotment * (pct / 100);
  const quantity = cost / q.price;
  initiateTrade("buy", quantity);
}

function sellPercentOfPosition(pct) {
  const { existingQty } = currentAllotmentInfo();
  const quantity = existingQty * (pct / 100);
  if (quantity <= 0) {
    const msg = document.getElementById("tradeMsg");
    msg.textContent = "You don't hold any shares of this symbol to sell.";
    msg.style.color = "var(--red)";
    return;
  }
  initiateTrade("sell", quantity);
}

document.querySelectorAll(".pct-buy-btn").forEach((btn) => {
  btn.addEventListener("click", () => buyPercentOfAllotment(parseFloat(btn.dataset.pct)));
});
document.querySelectorAll(".pct-sell-btn").forEach((btn) => {
  btn.addEventListener("click", () => sellPercentOfPosition(parseFloat(btn.dataset.pct)));
});
document.getElementById("customBuyPctBtn").addEventListener("click", () => {
  const pct = parseFloat(document.getElementById("customBuyPct").value);
  if (pct > 0 && pct <= 100) buyPercentOfAllotment(pct);
});
document.getElementById("customSellPctBtn").addEventListener("click", () => {
  const pct = parseFloat(document.getElementById("customSellPct").value);
  if (pct > 0 && pct <= 100) sellPercentOfPosition(pct);
});

function renderAllocationDonut(p) {
  const svg = document.getElementById("allocationDonut");
  const legend = document.getElementById("allocationLegend");
  if (!svg || !legend) return;

  const total = p.totalValue || 1;
  const palette = ["#8CFF00", "#4FA8FF", "#FF5C6C", "#FFB627", "#3ADC84", "#B685FF", "#FF8FB3", "#5EEAD4"];

  const slices = p.positions.map((pos, i) => ({ label: pos.symbol, value: pos.value, color: palette[i % palette.length] }));
  slices.push({ label: "Cash", value: p.cash, color: "#3A4A3A" });

  const r = 50, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
  let offset = 0;
  let paths = "";
  slices.forEach((s) => {
    const frac = Math.max(0, s.value) / total;
    const dash = frac * circumference;
    if (dash > 0) {
      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    }
    offset += dash;
  });
  svg.innerHTML = paths;

  legend.innerHTML = slices
    .filter((s) => s.value > 0.01)
    .map(
      (s) =>
        `<div class="allocation-legend-item"><span class="allocation-legend-swatch" style="background:${s.color}"></span>${s.label}: ${((s.value / total) * 100).toFixed(1)}%</div>`
    )
    .join("");
}

async function refreshCurrentPortfolio() {
  if (!currentPortfolioId) return;
  try {
    const p = await api(`/portfolios/${currentPortfolioId}`);
    latestPortfolioData = p;
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
          const pctOfPortfolio = p.totalValue > 0 ? (pos.value / p.totalValue) * 100 : 0;
          return `<tr><td class="mono">${pos.symbol}</td><td>${pos.quantity}</td><td>$${pos.avgCost.toFixed(2)}</td><td>$${pos.price.toFixed(2)}</td><td class="mono">${pctOfPortfolio.toFixed(1)}%</td><td class="${cls}">${pos.unrealizedPL >= 0 ? "+" : ""}$${pos.unrealizedPL.toFixed(2)}</td></tr>`;
        })
        .join("") || `<tr><td colspan="6" style="color:var(--text-dim);">No positions yet — buy something!</td></tr>`;

    renderAllocationDonut(p);
    renderWatchlist();
    updatePctHints();

    // Order history
    const trades = await api(`/portfolios/${currentPortfolioId}/trades`);
    const historyBody = document.getElementById("orderHistoryTable");
    historyBody.innerHTML =
      trades
        .slice(0, 20)
        .map(
          (t) =>
            `<tr><td class="mono" style="font-size:11px;">${new Date(t.timestamp).toLocaleString()}</td><td class="${t.side === "buy" ? "up" : "down"}">${t.side.toUpperCase()}</td><td class="mono">${t.symbol}</td><td>${t.quantity}</td><td>$${t.price.toFixed(2)}</td></tr>`
        )
        .join("") || `<tr><td colspan="5" style="color:var(--text-dim);">No orders yet.</td></tr>`;

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
function renderLiveContestsList() {
  const el = document.getElementById("liveCategoriesList");
  const categories = [];

  if (contestsCache.current) {
    const c = contestsCache.current;
    const payout =
      c.brokersProjected > 0
        ? `${c.brokersProjected} Broker${c.brokersProjected === 1 ? "" : "s"} funded + ${c.remainderProjected.toLocaleString()} STONK to next`
        : `${c.remainderProjected.toLocaleString()} STONK pooled toward first Broker`;
    categories.push({
      kind: "main",
      name: "🏆 Main Event",
      sub: `${c.entrantCount} entries · ${c.poolGross.toLocaleString()} STONK pooled · ${payout}`,
      buttonLabel: "View leaderboard",
      onClick: () => showLiveLeaderboard("contest", c.id),
    });
  } else {
    categories.push({ kind: "main", name: "🏆 Main Event", sub: "Closed for the weekend", buttonLabel: "—", onClick: null });
  }

  (satellitesCache.categories || []).forEach((cat) => {
    const openCount = cat.levels.filter((l) => l.status === "open").length;
    const sub = openCount > 0 ? `${openCount} of ${cat.levels.length} rooms open right now` : "Not open right now — check price levels for next open time";
    categories.push({
      kind: "satellite",
      name: `${cat.icon} ${cat.name}`,
      sub,
      buttonLabel: "View rooms",
      onClick: () => showLiveDrilldown(cat),
    });
  });

  el.innerHTML = categories
    .map(
      (c, i) => `<div class="portfolio-row">
      <div class="portfolio-row-main">
        <div class="portfolio-row-label">${c.name}</div>
        <div class="portfolio-row-sub mono">${c.sub}</div>
      </div>
      ${c.onClick ? `<button class="btn btn-outline btn-sm live-cat-btn" data-idx="${i}">${c.buttonLabel}</button>` : ""}
    </div>`
    )
    .join("");

  el.querySelectorAll(".live-cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => categories[Number(btn.dataset.idx)].onClick());
  });
}

function showLiveDrilldown(cat) {
  document.getElementById("liveDrilldownTitle").textContent = cat.name;
  const body = document.getElementById("liveDrilldownBody");
  body.innerHTML = cat.levels
    .map((lvl) => {
      const isOpen = lvl.status === "open";
      const isPending = lvl.status === "pending";
      const payout = isOpen
        ? lvl.ticketsProjected > 0
          ? `${lvl.ticketsProjected} ticket${lvl.ticketsProjected === 1 ? "" : "s"} funded + ${lvl.remainderProjected.toLocaleString()} STONK to next`
          : `${lvl.remainderProjected.toLocaleString()} STONK pooled toward first ticket`
        : isPending
          ? `<span class="countdown-text" data-ends="${lvl.opensAt}">${fmtCountdown(lvl.opensAt)}</span> until it opens`
          : "Locked";
      const sub = isOpen ? `${lvl.entrantCount} entries · ${lvl.poolGross.toLocaleString()} STONK pooled · ${payout}` : payout;
      return `<div class="portfolio-row">
        <div class="portfolio-row-main">
          <div class="portfolio-row-label">${lvl.priceLevelName || lvl.priceLevel} — ${lvl.entryFee.toLocaleString()} STONK <span style="font-weight:400;color:var(--text-dim);">(~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"})</span></div>
          <div class="portfolio-row-sub mono">${sub}</div>
        </div>
        ${isOpen ? `<button class="btn btn-outline btn-sm view-live-lb-btn" data-id="${lvl.id}">View leaderboard</button>` : ""}
      </div>`;
    })
    .join("");

  body.querySelectorAll(".view-live-lb-btn").forEach((btn) => {
    btn.addEventListener("click", () => showLiveLeaderboard("satellite", btn.dataset.id));
  });

  document.getElementById("liveDrilldownPanel").style.display = "block";
  document.getElementById("liveLeaderboardPanel").style.display = "none";
  document.getElementById("liveDrilldownPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
document.getElementById("closeLiveDrilldown").addEventListener("click", () => {
  document.getElementById("liveDrilldownPanel").style.display = "none";
});

async function showLiveLeaderboard(type, id) {
  try {
    const lb = await api(`/leaderboard/${type}/${id}`);
    document.getElementById("liveLeaderboardTitle").textContent = type === "contest" ? "Main Event Leaderboard" : "Room Leaderboard";
    document.getElementById("liveLeaderboardBody").innerHTML = leaderboardRowsHtml(lb);
    document.getElementById("liveLeaderboardPanel").style.display = "block";
    document.getElementById("liveLeaderboardPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    console.error(err);
  }
}
document.getElementById("closeLiveLeaderboard").addEventListener("click", () => {
  document.getElementById("liveLeaderboardPanel").style.display = "none";
});

function renderPastWinnersArchive(winners) {
  const el = document.getElementById("pastWinnersArchive");
  if (!el) return;
  el.innerHTML =
    winners
      .map((w) => {
        const prizeLabel =
          w.prizeType === "broker"
            ? "🏆 Activated Stonk Broker"
            : w.prizeType === "ticket"
              ? "🎟️ Main Event Ticket"
              : `${(w.prizeAmount || 0).toLocaleString()} STONK`;
        return `<div class="portfolio-row">
        <div class="portfolio-row-main">
          <div class="portfolio-row-label">${w.displayName} <span style="color:var(--text-dim);font-weight:400;">won ${prizeLabel}</span></div>
          <div class="portfolio-row-sub mono">${w.name} · ${new Date(w.resolvedAt).toLocaleDateString()}</div>
        </div>
      </div>`;
      })
      .join("") || `<div class="history-empty">No resolved contests yet — check back after the first rooms wrap up.</div>`;
}

async function refreshLeaderboards() {
  try {
    const [myStats, lifetime, pastWinners] = await Promise.all([
      token ? api("/leaderboard/me") : Promise.resolve(null),
      api("/leaderboard/lifetime"),
      api("/leaderboard/recent-winners"),
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

    renderLiveContestsList();
    renderPastWinnersArchive(pastWinners);
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

// ---------------- Auto-fill allocation modal ----------------
let allocRowCount = 0;

function populateAllocTargetSelect() {
  const sel = document.getElementById("allocTargetSelect");
  const options = [`<option value="contest::">Main Event — 3,000 STONK</option>`];
  const seen = new Set();
  (satellitesCache.categories || []).forEach((cat) => {
    cat.levels.forEach((lvl) => {
      const key = `${cat.id}:${lvl.priceLevel}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push(
        `<option value="satellite:${cat.id}:${lvl.priceLevel}">${cat.name} — ${lvl.priceLevelName || lvl.priceLevel} (${lvl.entryFee.toLocaleString()} STONK / ~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"})</option>`
      );
    });
  });
  sel.innerHTML = options.join("");
}

function addAllocRow(symbol = "", percent = "", containerId = "allocationRows", totalId = "allocTotalPct", idPrefix = "allocRow") {
  allocRowCount++;
  const id = `${idPrefix}${allocRowCount}`;
  const symbolOptions = (window.__symbols || [])
    .map((s) => `<option value="${s.symbol}" ${s.symbol === symbol ? "selected" : ""}>${s.symbol}</option>`)
    .join("");

  // Smart default: fill with as much as makes sense — up to the 10% cap,
  // capped further by whatever room is left before hitting 100% total —
  // rather than always defaulting to a flat 5% the user has to fix.
  let defaultPct = percent;
  if (!defaultPct) {
    const currentTotal = [...document.querySelectorAll(`#${containerId} .alloc-percent`)].reduce(
      (s, r) => s + (parseFloat(r.value) || 0),
      0
    );
    defaultPct = Math.max(0.1, Math.min(10, Math.round((100 - currentTotal) * 10) / 10));
  }

  const row = document.createElement("div");
  row.className = "alloc-row";
  row.id = id;
  row.innerHTML = `
    <select class="alloc-symbol">${symbolOptions}</select>
    <input type="number" class="alloc-percent" min="0.1" max="10" step="0.1" value="${defaultPct}">
    <span style="font-size:12px;color:var(--text-dim);">%</span>
    <button class="alloc-row-remove" type="button" onclick="document.getElementById('${id}').remove(); updateAllocTotal('${containerId}','${totalId}');">✕</button>
  `;
  document.getElementById(containerId).appendChild(row);
  row.querySelector(".alloc-percent").addEventListener("input", () => updateAllocTotal(containerId, totalId));
  updateAllocTotal(containerId, totalId);
}

function updateAllocTotal(containerId = "allocationRows", totalId = "allocTotalPct") {
  const rows = document.querySelectorAll(`#${containerId} .alloc-percent`);
  let total = 0;
  rows.forEach((r) => (total += parseFloat(r.value) || 0));
  document.getElementById(totalId).textContent = total.toFixed(1);
}

function openAllocationModal(presetValue) {
  editingAllocationId = null;
  populateAllocTargetSelect();
  document.getElementById("allocTargetSelect").disabled = false;
  if (presetValue) document.getElementById("allocTargetSelect").value = presetValue;
  document.getElementById("allocationRows").innerHTML = "";
  allocRowCount = 0;
  const symbols = window.__symbols || [];
  const rowCount = Math.min(10, symbols.length || 10);
  for (let i = 0; i < rowCount; i++) {
    addAllocRow(symbols[i]?.symbol || "", 10);
  }
  document.getElementById("allocationMsg").textContent = "";
  document.getElementById("allocationModalIntro").textContent =
    "Set this up before a contest opens. The moment it does, you're entered and this allocation fires at the opening price — free to trade normally after.";
  document.getElementById("allocationModal").style.display = "flex";
}


document.getElementById("addAllocRowBtn").addEventListener("click", () => addAllocRow());
document.getElementById("allocationModalClose").addEventListener("click", closeAllocationModal);
document.getElementById("allocationModalBackdrop").addEventListener("click", closeAllocationModal);
function closeAllocationModal() {
  document.getElementById("allocationModal").style.display = "none";
}

document.getElementById("submitAllocationBtn").addEventListener("click", async () => {
  const msg = document.getElementById("allocationMsg");
  msg.textContent = "";
  const [targetType, tierId, priceLevel] = document.getElementById("allocTargetSelect").value.split(":");
  const allocations = [...document.querySelectorAll(".alloc-row")].map((row) => ({
    symbol: row.querySelector(".alloc-symbol").value,
    percent: parseFloat(row.querySelector(".alloc-percent").value) || 0,
  }));

  try {
    if (editingAllocationId) {
      await api(`/allocations/${editingAllocationId}`, { method: "PUT", body: JSON.stringify({ allocations }) });
      msg.textContent = "Updated — this reservation is set.";
    } else {
      await api("/allocations", {
        method: "POST",
        body: JSON.stringify({ targetType, tierId: tierId || undefined, priceLevel: priceLevel || undefined, allocations }),
      });
      msg.textContent = "Saved — this fires automatically the instant that contest opens.";
    }
    msg.style.color = "var(--green)";
    refreshContests();
    refreshMyContests();
    setTimeout(closeAllocationModal, 1400);
  } catch (err) {
    msg.style.color = "var(--red)";
    msg.textContent = err.message;
  }
});

// ---------------- Scheduled order modal (existing portfolio, next market open) ----------------
let scheduledOrderPortfolioId = null;

function openScheduledOrderModal(portfolioId, label) {
  scheduledOrderPortfolioId = portfolioId;
  document.getElementById("scheduledOrderContextLabel").textContent =
    `${label} — fires at the next real market open (9:30am ET). Free to trade normally after.`;
  document.getElementById("scheduledOrderRows").innerHTML = "";
  const symbols = window.__symbols || [];
  const rowCount = Math.min(10, symbols.length || 10);
  for (let i = 0; i < rowCount; i++) {
    addAllocRow(symbols[i]?.symbol || "", 10, "scheduledOrderRows", "scheduledTotalPct", "schedRow");
  }
  document.getElementById("scheduledOrderMsg").textContent = "";
  document.getElementById("scheduledOrderModal").style.display = "flex";
}
function closeScheduledOrderModal() {
  document.getElementById("scheduledOrderModal").style.display = "none";
}
document.getElementById("scheduledOrderModalClose").addEventListener("click", closeScheduledOrderModal);
document.getElementById("scheduledOrderModalBackdrop").addEventListener("click", closeScheduledOrderModal);
document.getElementById("addScheduledRowBtn").addEventListener("click", () =>
  addAllocRow("", "", "scheduledOrderRows", "scheduledTotalPct", "schedRow")
);

document.getElementById("submitScheduledOrderBtn").addEventListener("click", async () => {
  const msg = document.getElementById("scheduledOrderMsg");
  msg.textContent = "";
  const allocations = [...document.querySelectorAll("#scheduledOrderRows .alloc-row")].map((row) => ({
    symbol: row.querySelector(".alloc-symbol").value,
    percent: parseFloat(row.querySelector(".alloc-percent").value) || 0,
  }));
  try {
    const result = await api("/scheduled-orders", {
      method: "POST",
      body: JSON.stringify({ portfolioId: scheduledOrderPortfolioId, allocations }),
    });
    msg.style.color = "var(--green)";
    msg.textContent = `Queued — fires at ${new Date(result.targetOpenAt).toLocaleString()}.`;
    await refreshMyContests();
    setTimeout(closeScheduledOrderModal, 1600);
  } catch (err) {
    msg.style.color = "var(--red)";
    msg.textContent = err.message;
  }
});

// ---------------- Ticket Market ----------------
async function refreshTicketMarket() {
  try {
    const [myTickets, active, mine] = await Promise.all([
      api("/tickets"),
      api("/ticket-market"),
      api("/ticket-market/mine"),
    ]);

    const forSale = (myTickets.tickets || []).filter((t) => t.status === "unredeemed");
    document.getElementById("myUnredeemedTicketsForSale").innerHTML =
      forSale
        .map(
          (t) => `<div class="portfolio-row">
        <div class="portfolio-row-main">
          <div class="portfolio-row-label">Ticket #${t.id}</div>
          <div class="portfolio-row-sub mono">${t.value_stonk.toLocaleString()} STONK face value</div>
        </div>
        <input type="number" class="list-price-input" id="listPrice${t.id}" placeholder="Ask price" min="1" style="width:100px;">
        <button class="btn btn-gold btn-sm list-ticket-btn" data-id="${t.id}">List for sale</button>
      </div>`
        )
        .join("") || `<div class="history-empty">No unredeemed tickets to sell — win one from a satellite first.</div>`;

    document.getElementById("myListingsList").innerHTML =
      mine.map(listingRowHtml).join("") || `<div class="history-empty">No listings yet.</div>`;

    document.getElementById("activeListingsList").innerHTML =
      active.filter((l) => !l.isMine).map(listingRowHtml).join("") ||
      `<div class="history-empty">No active listings from other traders right now.</div>`;

    document.querySelectorAll(".list-ticket-btn").forEach((btn) => {
      btn.addEventListener("click", () => listTicketForSale(btn.dataset.id));
    });
    document.querySelectorAll(".buy-listing-btn").forEach((btn) => {
      btn.addEventListener("click", () => buyListing(btn.dataset.id));
    });
    document.querySelectorAll(".cancel-listing-btn").forEach((btn) => {
      btn.addEventListener("click", () => cancelListing(btn.dataset.id));
    });
  } catch (err) {
    console.error(err);
  }
}

function listingRowHtml(l) {
  const statusBadge =
    l.status === "active"
      ? l.isMine
        ? `<button class="btn btn-outline btn-sm cancel-listing-btn" data-id="${l.id}">Cancel</button>`
        : `<button class="btn btn-gold btn-sm buy-listing-btn" data-id="${l.id}">Buy — ${l.askPrice.toLocaleString()} STONK</button>`
      : l.status === "sold"
        ? `<span class="table-badge joined">Sold</span>`
        : `<span class="table-badge" style="opacity:.6;">Cancelled</span>`;
  return `<div class="portfolio-row">
    <div class="portfolio-row-main">
      <div class="portfolio-row-label">Ticket #${l.ticketId} ${l.isMine ? "" : `· sold by ${l.sellerDisplayName}`}</div>
      <div class="portfolio-row-sub mono">Ask: ${l.askPrice.toLocaleString()} STONK</div>
    </div>
    ${statusBadge}
  </div>`;
}

async function listTicketForSale(ticketId) {
  const priceInput = document.getElementById(`listPrice${ticketId}`);
  const price = parseFloat(priceInput.value);
  if (!price || price <= 0) {
    alert("Enter a valid asking price first.");
    return;
  }
  try {
    await api("/ticket-market", { method: "POST", body: JSON.stringify({ ticketId: Number(ticketId), askPrice: price }) });
    refreshTicketMarket();
  } catch (err) {
    alert(err.message);
  }
}

async function buyListing(id) {
  if (!confirm("Buy this ticket now? STONK will be deducted immediately.")) return;
  try {
    await api(`/ticket-market/${id}/buy`, { method: "POST" });
    refreshTicketMarket();
    refreshPortfoliosBalance();
  } catch (err) {
    alert(err.message);
  }
}

async function cancelListing(id) {
  try {
    await api(`/ticket-market/${id}`, { method: "DELETE" });
    refreshTicketMarket();
  } catch (err) {
    alert(err.message);
  }
}

// ---------------- Boot ----------------
if (token) showApp();
