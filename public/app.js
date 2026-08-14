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
    setSession(data.token, data.displayName, true); // true = fresh signup, triggers onboarding
  } catch (err) {
    msg.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("displayName");
  location.reload();
});

function setSession(t, name, isNewSignup) {
  token = t;
  displayName = name;
  localStorage.setItem("token", t);
  localStorage.setItem("displayName", name);
  showApp(isNewSignup);
}

// ---------------- First-time onboarding sequence ----------------
const ONBOARDING_CONTENT = {
  welcome: {
    icon: "🏆",
    title: "You're playing for a real Main Event ticket",
    body: "Your free Weekly contest is a genuine, no-risk shot at winning your way straight into the Main Event — no wallet, no risk, just an account. Let's get you in.",
    cta: "Enter my free Weekly contest",
    action: () => {
      switchView("lobby");
      const weeklyCat = satellitesCache.categories?.find((c) => c.id === "weekly_qualifier");
      const freerollLevel = weeklyCat?.levels.find((l) => l.priceLevel === "free");
      if (!freerollLevel) return;
      if (freerollLevel.status === "pending") {
        reserveRoom("weekly_qualifier", "free", 1, "welcome", freerollLevel.opensAt);
      } else {
        joinSatellite(freerollLevel.id, 1, "welcome", freerollLevel.locksAt);
      }
    },
  },
  portfolio: {
    icon: "✅",
    title: "You're in!",
    bodyFor: (wasReservation) =>
      wasReservation
        ? "Now let's set up your portfolio — pick your stocks before your free Weekly contest starts. Once it opens, your reservation fires automatically with whatever's set."
        : "Now let's set up your portfolio — pick your stocks anytime before your free Weekly contest resolves. Head to My Contests to get started.",
    cta: "Go to My Contests",
    action: () => switchView("mycontests"),
  },
  to_hourly: {
    icon: "⚡",
    title: "Trade now, free — try Degen Hours",
    body: "It's open right now and resolves within the hour. Win it and you get a ticket into that hour's Runner-level satellite. You'll get a fresh shot like this every single hour, all day, every day.",
    cta: "Enter my free Degen Hours contest",
    action: () => {
      switchView("lobby");
      const hourlyCat = satellitesCache.categories?.find((c) => c.id === "hourly");
      const freerollLevel = hourlyCat?.levels.find((l) => l.priceLevel === "free");
      if (freerollLevel && freerollLevel.status === "open") {
        joinSatellite(freerollLevel.id, 1, "to_hourly", freerollLevel.locksAt);
      }
    },
  },
  portfolio_hourly: {
    icon: "✅",
    title: "You're in your Degen Hours contest too!",
    body: "Same deal — set up this portfolio too, and you've got two free results coming today.",
    cta: "Go to My Contests",
    action: () => switchView("mycontests"),
  },
  ready: {
    icon: "🚀",
    title: "You're all set up",
    body: "Ready for more? Check the Lobby for what's starting soon — rooms start at just $1 when you're ready to go beyond free.",
    cta: "Go to the Lobby",
    action: () => switchView("lobby"),
  },
};

function showOnboardingPopup(step) {
  const content = ONBOARDING_CONTENT[step];
  if (!content) return;
  document.getElementById("onboardingIcon").textContent = content.icon;
  document.getElementById("onboardingTitle").textContent = content.title;
  // The "set up your portfolio" steps need different wording depending on
  // HOW the trader actually entered: if the room was already open, they
  // got a real portfolio immediately and can keep adjusting picks right up
  // until it resolves. If the room wasn't open yet (a reservation), the
  // real deadline is before it STARTS — once it opens, the reservation
  // auto-fires with whatever's configured. Same popup covering both cases
  // with one static verb was correct for one and wrong for the other.
  const wasReservation = localStorage.getItem("onboardingLastEntryWasReservation") === "true";
  const body =
    (step === "portfolio" || step === "portfolio_hourly") && typeof content.bodyFor === "function"
      ? content.bodyFor(wasReservation)
      : content.body;
  document.getElementById("onboardingBody").textContent = body;
  document.getElementById("onboardingCtaBtn").textContent = content.cta;
  document.getElementById("onboardingCtaBtn").onclick = () => {
    closeOnboardingPopup();
    content.action();
  };
  document.getElementById("onboardingModal").style.display = "flex";
}
function closeOnboardingPopup() {
  document.getElementById("onboardingModal").style.display = "none";
}
document.getElementById("onboardingBackdrop").addEventListener("click", closeOnboardingPopup);
document.getElementById("onboardingSkipBtn").addEventListener("click", () => {
  localStorage.setItem("onboardingStep", "dismissed");
  closeOnboardingPopup();
});

// Advances the sequence only if the trader is actually still IN it —
// existing users, or anyone who already finished/skipped, never see these
// again regardless of what they do in the app afterward.
// Advances the sequence only if the trader is actually still IN it —
// existing users, or anyone who already finished/skipped, never see these
// again regardless of what they do in the app afterward.
//
// The welcome -> portfolio step still shows immediately. But portfolio ->
// ready is different by design: rather than nagging them about the $1
// tiers the moment they finish their first trade, it holds off until
// there's a real gap to fill — specifically the window AFTER their first
// (every-other-hour) freeroll resolves but BEFORE their next one opens,
// anchored to that room's actual real lock time, not a guess.
function advanceOnboarding(fromStep, toStep) {
  if (localStorage.getItem("onboardingStep") !== fromStep) return;
  localStorage.setItem("onboardingStep", toStep);
  showOnboardingPopup(toStep);
}

function beginWaitingForReady(roomLocksAt) {
  // A roughly 1-hour buffer after this room resolves before nagging about
  // paid tiers — long enough to feel like a natural pause, not a hard tie
  // to any specific category's exact cadence.
  const resolvesAt = roomLocksAt ? new Date(roomLocksAt).getTime() : Date.now();
  localStorage.setItem("onboardingReadyEligibleAt", String(resolvesAt));
  localStorage.setItem("onboardingReadyExpiresAt", String(resolvesAt + 60 * 60000));
  localStorage.setItem("onboardingStep", "waiting_for_ready");
  checkDelayedOnboardingPrompt(); // in case the eligible window already started by the time they finished setup
}

// Single orchestration point for "the trader just finished setting up a
// portfolio" — called generically from both the trade and allocation-save
// success paths, and branches on whatever onboarding step they're
// actually on right now:
//   portfolio         (just finished Weekly's setup) -> if an Hourly free
//                      roll happens to be open right now, bridge them
//                      straight into it; otherwise skip ahead to the
//                      delayed $1 prompt, anchored to Weekly's own resolution
//   portfolio_hourly   (just finished Hourly's setup) -> always goes to
//                      the delayed $1 prompt, anchored to Hourly's resolution
function onboardingPortfolioConfigured() {
  const step = localStorage.getItem("onboardingStep");
  const roomLocksAt = localStorage.getItem("onboardingCurrentRoomLocksAt") || null;
  if (step === "portfolio") {
    const hourlyCat = satellitesCache.categories?.find((c) => c.id === "hourly");
    const hourlyFreeroll = hourlyCat?.levels.find((l) => l.priceLevel === "free");
    if (hourlyFreeroll && hourlyFreeroll.status === "open") {
      advanceOnboarding("portfolio", "to_hourly");
    } else {
      beginWaitingForReady(roomLocksAt);
    }
  } else if (step === "portfolio_hourly") {
    beginWaitingForReady(roomLocksAt);
  }
}

// Checked on every boot() (i.e. whenever the trader loads or returns to
// the app) — fires the "ready for more" prompt only inside its real
// eligible window, not the instant portfolio setup finishes.
function checkDelayedOnboardingPrompt() {
  // Fallback nudge toward Hourly — fires 12 minutes after Weekly entry
  // REGARDLESS of whether the trader has configured Weekly's portfolio
  // yet, so it doesn't depend entirely on that action happening first.
  if (localStorage.getItem("onboardingStep") === "portfolio") {
    const nudgeAt = Number(localStorage.getItem("onboardingHourlyNudgeAt") || 0);
    if (nudgeAt && Date.now() >= nudgeAt) {
      const hourlyCat = satellitesCache.categories?.find((c) => c.id === "hourly");
      const hourlyFreeroll = hourlyCat?.levels.find((l) => l.priceLevel === "free");
      if (hourlyFreeroll && hourlyFreeroll.status === "open") {
        advanceOnboarding("portfolio", "to_hourly");
      } else {
        // Hourly isn't open right at this exact check either — clear the
        // nudge so it doesn't keep re-checking forever; the natural
        // "finished configuring Weekly" trigger can still fire normally.
        localStorage.removeItem("onboardingHourlyNudgeAt");
      }
    }
  }

  if (localStorage.getItem("onboardingStep") !== "waiting_for_ready") return;
  const eligibleAt = Number(localStorage.getItem("onboardingReadyEligibleAt") || 0);
  const expiresAt = Number(localStorage.getItem("onboardingReadyExpiresAt") || 0);
  const now = Date.now();
  if (now >= eligibleAt && now < expiresAt) {
    localStorage.setItem("onboardingStep", "ready");
    showOnboardingPopup("ready");
  } else if (now >= expiresAt) {
    // Missed the window (didn't open the app in time) — end the sequence
    // quietly rather than show a stale "starting soon" prompt days later.
    localStorage.setItem("onboardingStep", "dismissed");
  }
}

function showApp(isNewSignup) {
  document.getElementById("authScreen").style.display = "none";
  document.getElementById("appScreen").style.display = "block";
  const welcomeEl = document.getElementById("welcomeMsg");
  if (welcomeEl) welcomeEl.textContent = `Hey, ${displayName}`;
  boot();
  if (isNewSignup) {
    localStorage.setItem("onboardingStep", "welcome");
    setTimeout(() => showOnboardingPopup("welcome"), 600); // small delay so the Lobby is visible underneath first
  }
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
  populateWatchlistAddSelect();
  refreshPortfoliosBalance();
  refreshContests();
  refreshReferrals();
  refreshStbPrice();
  checkDelayedOnboardingPrompt();
  setInterval(refreshPortfoliosBalance, 5000);
  setInterval(refreshContests, 5000);
  setInterval(tickCountdowns, 1000);
  setInterval(refreshStbPrice, 15000);
  setInterval(checkDelayedOnboardingPrompt, 60000); // check every minute in case the tab stays open through the eligible window
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
        renderMyWatchlist();
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
    renderWeeklyFreerollPrompt();
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
  const nftQuoteEl = document.getElementById("heroNftQuote");
  if (c) {
    countdownEl.dataset.ends = c.weekEnd;
    countdownEl.textContent = fmtCountdown(c.weekEnd);
    entriesEl.textContent = c.entrantCount.toLocaleString();
    brokersEl.textContent = c.brokersProjected;
    if (nftQuoteEl) {
      nftQuoteEl.textContent = `~$${c.brokerUnitCostUsd?.toLocaleString(undefined, { minimumFractionDigits: 0 }) ?? "0"}`;
      nftQuoteEl.title = `${c.brokerUnitCost.toLocaleString()} STONK to acquire + activate one Stonk Broker NFT`;
    }
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
const ALL_TIER_LEVELS = ["free", "runner", "low", "mid", "high"];
let tierFilter = new Set(ALL_TIER_LEVELS);

function renderTierFilterBar() {
  const el = document.getElementById("tierFilterBar");
  const labels = { free: "Freeroll", runner: "Runner", low: "Clerk", mid: "Trader", high: "Jr. Stonkbroker" };
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
  weekly_qualifier: "Runs 9:30am ET Monday (opening bell) through 4:00pm ET Friday (closing bell) — the SAME window as the Main Event. Win a contest here and you're straight into the Main Event for free.",
  full_day: "Runs the full trading session, 9:30 AM \u2013 4:00 PM ET, every weekday. New contest opens each trading day. Win the free tier and you get a ticket into that day's Runner-level satellite.",
  morning: "Runs the first half of the trading session, 9:30 AM \u2013 1:00 PM ET, every weekday. Win the free tier and you get a ticket into that day's Runner-level satellite.",
  afternoon: "Runs the second half of the trading session, 1:00 PM \u2013 4:00 PM ET, every weekday. Win the free tier and you get a ticket into that day's Runner-level satellite.",
  hourly: "🔥 Degen Hours — no 10% position cap, ever. Runs 24/7, every single hour, every level including the free roll — win it and you get a ticket into that hour's Runner-level satellite.",
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
          <div class="portfolio-row-sub mono">${openCount} of ${visibleLevels.length} contests open now</div>
        </div>
        <button class="btn btn-outline btn-sm lobby-cat-btn" data-idx="${i}">Browse contests</button>
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
      const atMax = lvl.maxEntriesPerAccount != null && lvl.myEntryCount >= lvl.maxEntriesPerAccount;
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
      const isFreerollChip = lvl.priceLevel === "free";
      const prizeNoun = isFreerollChip
        ? cat.id === "weekly_qualifier"
          ? "Main Event ticket"
          : "Runner-level ticket"
        : "Main Event ticket";
      const ticketLine = !isLocked
        ? `<span class="stake-tickets">🎟️ ${lvl.ticketsProjected ?? 0} ${prizeNoun}${(lvl.ticketsProjected ?? 0) === 1 ? "" : "s"} banked <span class="breakdown-btn" data-breakdown-id="${lvl.id}">ⓘ breakdown</span></span>`
        : "";
      const feeLabel = lvl.entryFee === 0 ? "FREE" : `${lvl.entryFee.toLocaleString()} STONK`;
      const usdLabel = lvl.entryFee === 0 ? "no wallet needed" : `~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"}`;
      // Pending rooms show a real Enter/Join button too — clicking reserves
      // your spot right away (100% cash, no picks yet). Set up the actual
      // portfolio anytime before that room opens, from My Contests.
      // Registration for Daily/Weekly PAID tiers closes the moment the
      // session actually starts — matches the backend's /enter rule.
      // Freerolls (any category) and Degen Hours (any level) are the
      // deliberate exceptions and stay enterable all session long.
      const registrationClosed = !isPending && lvl.priceLevel !== "free" && cat.id !== "hourly";
      const clickAction = atMax || isLocked || registrationClosed ? "" : isPending ? "reserve-room-btn" : "join-sat-row-btn";
      const disabled = atMax || isLocked || registrationClosed;
      const hoverStats = !isPending
        ? registrationClosed
          ? "Registration closed the moment this session started — catch it before it opens next time."
          : isFreerollChip
            ? `${lvl.entrantCount} traders · win a ${prizeNoun}, no wallet needed`
            : `${lvl.entrantCount} traders · ${lvl.poolGross.toLocaleString()} STONK collected · projected: ${lvl.ticketsProjected || 0} ${prizeNoun}${(lvl.ticketsProjected || 0) === 1 ? "" : "s"} + ${(lvl.remainderProjected || 0).toLocaleString()} STONK remainder`
        : `Opens ${new Date(lvl.opensAt).toLocaleString()}`;
      return `<button class="stake-chip ${chipState} ${clickAction}" ${disabled ? "disabled" : ""} title="${hoverStats}" data-id="${lvl.id}" data-tier="${lvl.tierId}" data-level="${lvl.priceLevel}">
        <span class="stake-tier-name">${lvl.priceLevelName || lvl.priceLevel}</span>
        <span class="stake-fee">${feeLabel} <span class="stake-fee-usd">(${usdLabel})</span></span>
        <span class="stake-sub">${registrationClosed ? "Registration closed" : statusLine}</span>
        ${lvl.myEntryCount > 0 ? `<span class="stake-entry-counter">You've entered ${lvl.myEntryCount}${lvl.maxEntriesPerAccount != null ? `/${lvl.maxEntriesPerAccount}` : ""} time${lvl.myEntryCount === 1 ? "" : "s"}</span>` : ""}
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
      const remaining = lvl.maxEntriesPerAccount != null ? lvl.maxEntriesPerAccount - lvl.myEntryCount : 25; // unlimited backend-side; 25 is just a sane practical cap for the bulk-buy dropdown itself
      showEntryReview({
        badge: "ENTER SATELLITE",
        title: lvl.name,
        category: cat.name,
        tier: lvl.priceLevelName || lvl.priceLevel,
        entryNumber: lvl.maxEntriesPerAccount != null ? `${lvl.myEntryCount + 1} of ${lvl.maxEntriesPerAccount}` : `#${lvl.myEntryCount + 1} (unlimited)`,
        feeLabel: "Entry fee",
        feeText: lvl.entryFee === 0 ? "FREE — no wallet needed" : `${lvl.entryFee.toLocaleString()} STONK (~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"})`,
        feeEach: lvl.entryFee,
        maxQty: remaining,
        note:
          lvl.priceLevel === "free"
            ? `${lvl.entrantCount} traders already in this contest. ${lvl.ticketsProjected > 0 ? `A ${cat.id === "weekly_qualifier" ? "Main Event ticket" : "Runner-level ticket"} is banked and up for grabs right now.` : `Win it and you get a ${cat.id === "weekly_qualifier" ? "Main Event ticket" : "Runner-level ticket"}.`}`
            : `${lvl.entrantCount} traders already in this contest. ${lvl.ticketsProjected || 0} Main Event ticket${(lvl.ticketsProjected || 0) === 1 ? "" : "s"} currently funded.`,
        onConfirm: (qty) => joinSatellite(lvl.id, qty, lvl.priceLevel === "free", lvl.locksAt),
      });
    });
  });
  el.querySelectorAll(".reserve-room-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lvl = cat.levels.find((l) => l.tierId === btn.dataset.tier && l.priceLevel === btn.dataset.level);
      if (!lvl) return;
      const remaining = lvl.maxEntriesPerAccount != null ? lvl.maxEntriesPerAccount - lvl.myEntryCount : 25; // unlimited backend-side; 25 is just a sane practical cap for the bulk-buy dropdown itself
      showEntryReview({
        badge: "RESERVE YOUR SPOT",
        title: lvl.name,
        category: cat.name,
        tier: lvl.priceLevelName || lvl.priceLevel,
        entryNumber: lvl.maxEntriesPerAccount != null ? `${lvl.myEntryCount + 1} of ${lvl.maxEntriesPerAccount}` : `#${lvl.myEntryCount + 1} (unlimited)`,
        feeLabel: "Entry fee (charged on open)",
        feeText: lvl.entryFee === 0 ? "FREE — no wallet needed" : `${lvl.entryFee.toLocaleString()} STONK (~$${lvl.entryFeeUsd?.toFixed(2) ?? "0.00"})`,
        feeEach: lvl.entryFee,
        maxQty: remaining,
        note: "This contest hasn't opened yet — reserving locks your spot now. Set up your picks anytime before it opens, from My Contests.",
        onConfirm: (qty) => reserveRoom(btn.dataset.tier, btn.dataset.level, qty, btn.dataset.level === "free", lvl.opensAt),
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
async function joinSatellite(satelliteId, qty = 1, onboardingFromStep = null, roomLocksAt = null) {
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
    if (onboardingFromStep) {
      localStorage.setItem("onboardingCurrentRoomLocksAt", roomLocksAt || "");
      localStorage.setItem("onboardingLastEntryWasReservation", "false");
      if (onboardingFromStep === "welcome") {
        // Fallback so the Hourly nudge doesn't depend entirely on the
        // trader actively configuring Weekly's portfolio right away — if
        // they just browse instead, this fires anyway after a fixed
        // window rather than potentially never firing at all.
        localStorage.setItem("onboardingHourlyNudgeAt", String(Date.now() + 12 * 60000));
      }
      advanceOnboarding(onboardingFromStep, onboardingFromStep === "welcome" ? "portfolio" : "portfolio_hourly");
    }
  } catch (err) {
    await refreshContests();
    refreshPortfoliosBalance();
    alert(succeeded > 0 ? `Got ${succeeded} in before hitting: ${err.message}` : err.message);
  }
}

// Reserving a room that hasn't opened yet — creates an empty (100% cash)
// pending allocation. No picks required now; set up the actual portfolio
// anytime before the room opens, from My Contests.
async function reserveRoom(tierId, priceLevel, qty = 1, onboardingFromStep = null, roomOpensAt = null) {
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
      "Set up each portfolio anytime before this contest opens — it'll auto-fill with your picks the instant it does."
    );
    if (onboardingFromStep) {
      // Room hasn't opened yet, so there's no real locksAt to use — every
      // room here runs a fixed 1-hour session, so estimate resolution as
      // opensAt + 1hr.
      const estimatedLocksAt = roomOpensAt ? new Date(new Date(roomOpensAt).getTime() + 60 * 60000).toISOString() : "";
      localStorage.setItem("onboardingCurrentRoomLocksAt", estimatedLocksAt);
      localStorage.setItem("onboardingLastEntryWasReservation", "true");
      if (onboardingFromStep === "welcome") {
        localStorage.setItem("onboardingHourlyNudgeAt", String(Date.now() + 12 * 60000));
      }
      advanceOnboarding(onboardingFromStep, onboardingFromStep === "welcome" ? "portfolio" : "portfolio_hourly");
    }
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

// Prominent Lobby callout specifically for the Weekly Freeroll — the free
// path straight to a Main Event ticket. Two states: not entered yet (big
// CTA to enter right here), or already entered (nudge to My Contests to
// finish setting up picks — kept simple here, My Contests already owns
// the detailed configured/unconfigured tracking, no need to duplicate it).
function renderWeeklyFreerollPrompt() {
  const el = document.getElementById("weeklyFreerollPrompt");
  if (!el) return;
  const weeklyCat = satellitesCache.categories?.find((c) => c.id === "weekly_qualifier");
  const freerollLevel = weeklyCat?.levels.find((l) => l.priceLevel === "free");
  if (!freerollLevel) {
    el.style.display = "none";
    return;
  }

  // This is funded entirely by entry fees across every paid Weekly
  // Qualifier tier, all-time — a real, growing number, not a gimmick.
  const statsRow = `<div class="weekly-freeroll-stats">
    <span><b>${(freerollLevel.entrantCount || 0).toLocaleString()}</b> traders in this week's contest</span>
    <span><b>${freerollLevel.ticketsProjected || 0}</b> Main Event ticket${(freerollLevel.ticketsProjected || 0) === 1 ? "" : "s"} banked right now</span>
    <span><b>${(freerollLevel.lifetimeAwarded || 0).toLocaleString()}</b> free Main Event ticket${(freerollLevel.lifetimeAwarded || 0) === 1 ? "" : "s"} awarded all-time</span>
  </div>`;

  const atMax = freerollLevel.myEntryCount >= freerollLevel.maxEntriesPerAccount;
  if (atMax) {
    el.innerHTML = `<div class="weekly-freeroll-banner entered">
      <div class="weekly-freeroll-banner-text">
        <span class="weekly-freeroll-icon">🎟️</span>
        <div>
          <b>You're in this week's free Weekly contest!</b>
          <span>Win it and you get a real Main Event ticket. Finish setting up your portfolio.</span>
          ${statsRow}
        </div>
      </div>
      <button class="btn btn-gold" id="weeklyFreerollCta">Go to My Contests</button>
    </div>`;
    document.getElementById("weeklyFreerollCta").addEventListener("click", () => switchView("mycontests"));
  } else {
    const isPending = freerollLevel.status === "pending";
    el.innerHTML = `<div class="weekly-freeroll-banner">
      <div class="weekly-freeroll-banner-text">
        <span class="weekly-freeroll-icon">🎟️</span>
        <div>
          <b>Your free Weekly contest is ${isPending ? "coming up" : "open right now"} — win a real Main Event ticket, 100% free.</b>
          <span>No wallet needed. Set up your portfolio and you're straight in the running.</span>
          ${statsRow}
        </div>
      </div>
      <button class="btn btn-gold" id="weeklyFreerollCta">${isPending ? "Reserve my free spot" : "Enter free now"}</button>
    </div>`;
    document.getElementById("weeklyFreerollCta").addEventListener("click", () => {
      if (isPending) {
        reserveRoom("weekly_qualifier", "free", 1, "welcome", freerollLevel.opensAt);
      } else {
        joinSatellite(freerollLevel.id, 1, "welcome", freerollLevel.locksAt);
      }
    });
  }
  el.style.display = "block";
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

let expandedGroupKeys = new Set();

function renderEntryGroup(group) {
  // Always collapsed behind a click, always the same byline format,
  // regardless of how many entries are in this room — even a single
  // entry. Total consistency: every row in this list looks and behaves
  // exactly the same way, whether it's 1 entry or 10.
  const isUnconfigured = (item) => item.kind === "pending" && item.data.allocations.length === 0;
  const needsSetupCount = group.items.filter(isUnconfigured).length;
  const configuredCount = group.items.length - needsSetupCount;
  const summary = `${group.items.length} entered · ${configuredCount} portfolio${configuredCount === 1 ? "" : "s"} created — click to view each`;

  // Preserve whatever expand/collapse state this exact group was in before
  // this re-render — without this, every action anywhere on the page
  // forces a full re-render that silently snaps every tree back closed,
  // interrupting anyone mid-way through working across several entries.
  // Pending reservations don't carry an entry number in their own data the
  // way real portfolios do (that gets baked in server-side, at creation) —
  // compute a stable one here instead, based on creation order (id
  // ascending), so every entry in this group is distinguishable, not just
  // the ones that already became real portfolios.
  const pendingSortedById = group.items
    .filter((item) => item.kind === "pending")
    .sort((a, b) => a.data.id - b.data.id);
  const pendingEntryNumbers = new Map(pendingSortedById.map((item, i) => [item.data.id, i + 1]));

  const isExpanded = expandedGroupKeys.has(group.key);
  return `<div class="entry-group">
    <div class="portfolio-row entry-group-summary ${needsSetupCount > 0 ? "needs-setup" : ""}" data-group-key="${group.key}">
      <div class="portfolio-row-main">
        <div class="portfolio-row-label" style="text-transform:capitalize;">${group.label}</div>
        <div class="portfolio-row-sub mono">${summary}</div>
      </div>
      <span class="table-badge expand-caret">${isExpanded ? "▴ collapse" : "▾ expand"}</span>
    </div>
    <div class="entry-group-items" data-group-items="${group.key}" style="display:${isExpanded ? "block" : "none"};">
      ${group.items
        .map(
          // Real portfolios already carry their real, permanent "(Entry N)"
          // number in their own label (assigned once, at creation).
          // Pending ones get the number computed just above.
          (item) =>
            `<div class="entry-group-item">${
              item.kind === "portfolio" ? portfolioRowHtml(item.data) : allocationRowHtml(item.data, pendingEntryNumbers.get(item.data.id))
            }</div>`
        )
        .join("")}
    </div>
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

    // Build the portfolio -> scheduled order lookup FIRST — portfolioRowHtml
    // needs this to show the "Order Queued" indicator per entry, otherwise
    // there's no way to tell which of e.g. 10 entries already has one.
    const activeScheduled = scheduledOrders.filter((o) => o.status === "pending");
    scheduledOrdersByPortfolio = Object.fromEntries(activeScheduled.map((o) => [o.portfolioId, o]));

    const groups = groupEntriesByRoom(activePortfolios, pendingAllocs);
    document.getElementById("activePortfoliosList").innerHTML =
      groups.map(renderEntryGroup).join("") ||
      `<div class="history-empty">Nothing active — head to the Lobby to enter a contest.</div>`;

    // Past entries get the exact same collapsible-tree treatment as Active
    // — multiple resolved entries in the same room collapse into one line,
    // click to expand. No pending allocations apply here (nothing to
    // configure on a resolved contest), so this reuses the same grouping
    // function with an empty allocations list.
    const pastGroups = groupEntriesByRoom(past, []);
    document.getElementById("pastPortfoliosList").innerHTML =
      pastGroups.map(renderEntryGroup).join("") || `<div class="history-empty">No resolved contests yet.</div>`;

    document.querySelectorAll(".cancel-scheduled-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cancelScheduledOrder(btn.dataset.id);
      });
    });

    document.querySelectorAll(".entry-group-summary").forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", () => {
        const key = row.dataset.groupKey;
        const items = document.querySelector(`[data-group-items="${key}"]`);
        const caret = row.querySelector(".expand-caret");
        const isOpen = items.style.display !== "none";
        items.style.display = isOpen ? "none" : "block";
        if (caret) caret.textContent = isOpen ? "▾ expand" : "▴ collapse";
        if (isOpen) expandedGroupKeys.delete(key);
        else expandedGroupKeys.add(key);
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

function allocationRowHtml(a, entryNumber) {
  const targetLabel =
    a.targetType === "contest"
      ? "Main Event"
      : `${a.targetTierId.replace("_", " ")} — ${a.targetPriceLevel}`;
  const numberedLabel = entryNumber ? `${targetLabel} (Entry ${entryNumber})` : targetLabel;
  const hasPicks = a.allocations.length > 0;
  const isWonPrize = a.source === "freeroll_prize" || a.source === "freeroll_bonus";
  // A won prize is fundamentally different from a Main Event ticket: it's
  // NOT something you hold and redeem whenever you want. It's already
  // locked into the very next occurrence, automatically — use it (set up
  // your picks) or it plays out with 100% cash and is simply gone. No
  // saving it for later, no choosing a different round.
  const wonPrizeLabel =
    a.source === "freeroll_prize"
      ? `<span class="won-prize-badge">🎁 Free entry you WON</span>`
      : a.source === "freeroll_bonus"
        ? `<span class="won-prize-badge">🎁 Bonus freeroll you WON</span>`
        : "";
  const items = hasPicks
    ? a.allocations.map((x) => `${x.symbol} ${x.percent}%`).join(", ")
    : isWonPrize
      ? "Use it or lose it — this is locked into the next round automatically. Set up picks now, or it plays out on 100% cash."
      : "Reserved — no picks yet, 100% cash. Set up your portfolio before this contest opens.";
  const statusBadge =
    a.status === "pending"
      ? `<span class="table-badge">Waiting for open</span>`
      : a.status === "applied"
        ? `<span class="table-badge joined">Filled ✓</span>`
        : `<span class="table-badge" style="opacity:.6;">Failed: ${a.failReason || ""}</span>`;
  const isPending = a.status === "pending";
  return `<div class="portfolio-row ${isPending ? "editable-alloc-row" : ""} ${isWonPrize ? "won-prize-row" : ""}" ${isPending ? `data-alloc-id="${a.id}"` : ""}>
    <div class="portfolio-row-main">
      <div class="portfolio-row-label" style="text-transform:capitalize;">${numberedLabel} ${wonPrizeLabel}</div>
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
    "You can set up your portfolio anytime before this contest opens — it fires automatically at the opening price.";
}

async function cancelAllocation(id) {
  try {
    await api(`/allocations/${id}`, { method: "DELETE" });
    refreshMyContests();
  } catch (err) {
    alert(err.message);
  }
}

let scheduledOrdersByPortfolio = {};

function portfolioRowHtml(p) {
  const plCls = p.pl >= 0 ? "up" : "down";
  const isActive = p.context.status === "open" || p.context.status === "pending";
  const order = scheduledOrdersByPortfolio[p.id];
  const hasOrder = !!order;
  const orderSummary = hasOrder
    ? order.allocations.length > 0
      ? `${order.allocations.reduce((s, a) => s + a.percent, 0)}% allocated on open`
      : "100% cash on open"
    : "";
  return `<div class="portfolio-row ${hasOrder ? "has-scheduled-order" : ""}">
    <div class="portfolio-row-main">
      <div class="portfolio-row-label">${p.label} ${hasOrder ? `<span class="scheduled-order-badge">⏰ Order Queued</span>` : ""}</div>
      <div class="portfolio-row-sub mono">${p.positionCount} position${p.positionCount === 1 ? "" : "s"} · $${p.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
      ${hasOrder ? `<div class="portfolio-row-sub mono scheduled-order-summary">⏰ ${orderSummary} · fires ${new Date(order.targetOpenAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>` : ""}
    </div>
    <div class="portfolio-row-pl ${plCls} mono">${p.pl >= 0 ? "+" : "-"}$${Math.abs(p.pl).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
    ${
      isActive
        ? `<button class="btn ${hasOrder ? "btn-gold" : "btn-outline"} btn-sm schedule-order-btn" data-id="${p.id}" data-label="${p.label}">${hasOrder ? "Adjust queued order" : "Schedule open order"}</button>`
        : ""
    }
    ${hasOrder ? `<button class="btn btn-outline btn-sm cancel-scheduled-btn" data-id="${order.id}">Cancel order</button>` : ""}
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
let tradeMode = "pct"; // 'pct' | 'shares' — percentage is the default per design
let selectedPct = 25;

function populateSymbolPicker() {
  const picker = document.getElementById("symbolPicker");
  picker.innerHTML = (window.__symbols || [])
    .map((s) => `<option value="${s.symbol}">${s.symbol}</option>`)
    .join("");
}

function openTradeModal(sym) {
  document.getElementById("tradeModal").style.display = "flex";
  showTradeModalState("main");
  populateSymbolPicker();
  document.getElementById("symbolPicker").value = sym;
  switchTradeSymbol(sym);
  document.getElementById("tradeMsg").textContent = "";
}

// Switches the symbol shown WITHIN an already-open modal — chart, position
// summary, and reference numbers all refresh in place, no closing required.
function switchTradeSymbol(sym) {
  selectedSymbol = sym;
  document.getElementById("tradeModal").style.display = "flex";
  initChart(); // fresh chart each open — avoids sizing issues on a container that was hidden
  chartHistory[sym] = chartHistory[sym] || [];
  candleHistory[sym] = candleHistory[sym] || [];
  series.setData(chartMode === "candles" ? candleHistory[sym] : chartHistory[sym]);
  const q = latestQuotes[sym];
  if (q) {
    document.getElementById("chartPriceLabel").textContent = `${q.currency} ${q.price.toFixed(2)}`;
    updateDayRange(q);
  }
  renderPositionSummary();
  renderPortfolioTotalInModal();
  updatePctHints();
}

function renderPortfolioTotalInModal() {
  const el = document.getElementById("tradeModalPortfolioTotal");
  if (!el || !latestPortfolioData) return;
  el.textContent = `Portfolio: $${latestPortfolioData.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function renderPositionSummary() {
  const el = document.getElementById("positionSummary");
  if (!el || !latestPortfolioData) return;
  const degenBadge = latestPortfolioData.isDegenHours
    ? `<div class="degen-hours-badge">🔥 DEGEN HOURS — no 10% position cap, swing for the fences</div>`
    : "";
  const pos = latestPortfolioData.positions.find((p) => p.symbol === selectedSymbol);
  if (!pos) {
    el.innerHTML = `${degenBadge}<div class="position-summary-empty">No position yet — this'll be your first buy.</div>`;
    return;
  }
  const cls = pos.unrealizedPL >= 0 ? "up" : "down";
  const pct = latestPortfolioData.totalValue > 0 ? (pos.value / latestPortfolioData.totalValue) * 100 : 0;
  el.innerHTML = `
    ${degenBadge}
    <div class="position-summary-row"><span>${selectedSymbol} position</span><b class="mono">${fmtQty(pos.quantity)} shares</b></div>
    <div class="position-summary-row"><span>Avg cost</span><b class="mono">$${pos.avgCost.toFixed(2)}</b></div>
    <div class="position-summary-row"><span>P&amp;L</span><b class="mono ${cls}">${pos.unrealizedPL >= 0 ? "+" : ""}$${pos.unrealizedPL.toFixed(2)}</b></div>
    <div class="position-summary-row"><span>% of portfolio</span><b class="mono">${pct.toFixed(1)}%</b></div>
  `;
}

document.getElementById("symbolPicker").addEventListener("change", (e) => switchTradeSymbol(e.target.value));

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

// ---------------- My Watchlist (personal, curated) ----------------
let myWatchlist = JSON.parse(localStorage.getItem("myWatchlist") || "[]");

function saveMyWatchlist() {
  localStorage.setItem("myWatchlist", JSON.stringify(myWatchlist));
}

function populateWatchlistAddSelect() {
  const select = document.getElementById("watchlistAddSelect");
  if (!select) return;
  const available = (window.__symbols || []).filter((s) => !myWatchlist.includes(s.symbol));
  select.innerHTML =
    available.map((s) => `<option value="${s.symbol}">${s.symbol} — ${s.name}</option>`).join("") ||
    `<option disabled>All symbols added</option>`;
}

function renderMyWatchlist() {
  const tbody = document.getElementById("myWatchlistTable");
  if (!tbody) return;
  tbody.innerHTML =
    myWatchlist
      .map((sym) => {
        const meta = (window.__symbols || []).find((s) => s.symbol === sym);
        const q = latestQuotes[sym];
        const price = q ? q.price.toFixed(2) : "—";
        const chg = q ? q.changePct : 0;
        const cls = chg >= 0 ? "up" : "down";
        return `<tr class="watch-row" data-symbol="${sym}">
          <td class="mono">${sym}</td><td>${meta ? meta.exchange : ""}</td>
          <td class="mono price-cell" data-symbol="${sym}">${q ? q.currency : ""} ${price}</td>
          <td class="${cls}">${chg >= 0 ? "+" : ""}${chg}%</td>
          <td><button class="watchlist-remove-btn" data-symbol="${sym}" title="Remove from watchlist">✕</button></td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="5" style="color:var(--text-dim);">Nothing added yet — pick a symbol above.</td></tr>`;

  tbody.querySelectorAll(".watch-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".watchlist-remove-btn")) return; // don't trade when removing
      openTradeModal(row.dataset.symbol);
    });
  });
  tbody.querySelectorAll(".watchlist-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      myWatchlist = myWatchlist.filter((s) => s !== btn.dataset.symbol);
      saveMyWatchlist();
      populateWatchlistAddSelect();
      renderMyWatchlist();
    });
  });
}

document.getElementById("watchlistAddBtn")?.addEventListener("click", () => {
  const select = document.getElementById("watchlistAddSelect");
  const sym = select.value;
  if (!sym || myWatchlist.includes(sym)) return;
  myWatchlist.push(sym);
  saveMyWatchlist();
  populateWatchlistAddSelect();
  renderMyWatchlist();
});

document.getElementById("myWatchlistCollapseBtn")?.addEventListener("click", (e) => {
  const body = document.getElementById("myWatchlistBody");
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  e.target.textContent = isOpen ? "▸ expand" : "▾ collapse";
});

document.getElementById("marketsCollapseBtn")?.addEventListener("click", (e) => {
  const body = document.getElementById("marketsBody");
  const isOpen = body.style.display !== "none";
  body.style.display = isOpen ? "none" : "block";
  e.target.textContent = isOpen ? "▸ expand" : "▾ collapse";
});

function renderWatchlist() {
  const symbols = (window.__symbols || [])
    .filter((s) => selectedExchangeFilter === "ALL" || s.exchange === selectedExchangeFilter)
    .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0)); // biggest companies first
  const tbody = document.getElementById("watchlistTable");
  tbody.innerHTML = symbols
    .map((s) => {
      const q = latestQuotes[s.symbol];
      const price = q ? q.price.toFixed(2) : "—";
      const chg = q ? q.changePct : 0;
      const cls = chg >= 0 ? "up" : "down";
      const alreadyAdded = myWatchlist.includes(s.symbol);
      return `<tr class="watch-row" data-symbol="${s.symbol}">
        <td class="mono">${s.symbol}</td><td>${s.exchange}</td><td class="mono price-cell" data-symbol="${s.symbol}">${q ? q.currency : ""} ${price}</td>
        <td class="${cls}">${chg >= 0 ? "+" : ""}${chg}%</td>
        <td>${alreadyAdded ? `<span class="watchlist-added-tag">✓ Added</span>` : `<button class="watchlist-quickadd-btn" data-symbol="${s.symbol}">+ Watchlist</button>`}</td>
      </tr>`;
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

  tbody.querySelectorAll(".watch-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".watchlist-quickadd-btn")) return; // don't trade when quick-adding
      openTradeModal(row.dataset.symbol);
    });
  });
  tbody.querySelectorAll(".watchlist-quickadd-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sym = btn.dataset.symbol;
      if (!myWatchlist.includes(sym)) {
        myWatchlist.push(sym);
        saveMyWatchlist();
        populateWatchlistAddSelect();
        renderMyWatchlist();
      }
      renderWatchlist(); // re-render this table too, so the button flips to "✓ Added"
    });
  });
}

function selectSymbol(sym) {
  openTradeModal(sym);
}

function initChart() {
  const container = document.getElementById("chartContainer");
  container.innerHTML = "";
  chart = LightweightCharts.createChart(container, {
    layout: { background: { color: "transparent" }, textColor: "#7FA36E" },
    grid: { vertLines: { color: "#2A3A24" }, horzLines: { color: "#2A3A24" } },
    timeScale: { timeVisible: true, secondsVisible: true },
    height: container.clientHeight || 260, // follows whatever the CSS class (.trade-chart-container) resolves to at this screen size — single source of truth, no hardcoded mismatch between JS and CSS
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

const CLIENT_MAX_POSITION_PCT = 0.10; // must match server's MAX_INITIAL_POSITION_PCT in routes/portfolios.js
let latestPortfolioData = null;
let pendingTrade = null;

// ---- Trade flow preferences: two guardrail/informational screens a
// trader can silence — persisted per-browser via localStorage, not tied
// to a specific trade, and reversible anytime from the ⚙ link in the
// trade view's sticky bar. ----
function getTradePref(key) {
  return localStorage.getItem(key) === "true";
}
function setTradePref(key, value) {
  localStorage.setItem(key, value ? "true" : "false");
}

function openTradeSettings() {
  // Checkbox meaning here is inverted from the stored preference — the
  // stored flag is "skip this screen", the checkbox reads "show this
  // screen", since that's the more intuitive way to present a toggle
  // meant specifically for turning things back ON.
  document.getElementById("settingsReviewToggle").checked = !getTradePref("skipTradeReview");
  document.getElementById("settingsFilledToggle").checked = !getTradePref("skipOrderFilled");
  document.getElementById("tradeSettingsModal").style.display = "flex";
}
function closeTradeSettings() {
  document.getElementById("tradeSettingsModal").style.display = "none";
}
document.getElementById("tradeSettingsBtn")?.addEventListener("click", openTradeSettings);
document.getElementById("tradeSettingsClose")?.addEventListener("click", closeTradeSettings);
document.getElementById("tradeSettingsBackdrop")?.addEventListener("click", closeTradeSettings);
document.getElementById("settingsReviewToggle")?.addEventListener("change", (e) => setTradePref("skipTradeReview", !e.target.checked));
document.getElementById("settingsFilledToggle")?.addEventListener("change", (e) => setTradePref("skipOrderFilled", !e.target.checked));

// Shares are stored as full-precision floats (a $100 buy at $453.99 gives
// you 0.22026916892442564... shares, not a round number) — fine for
// accounting, unusable directly in a table. Round to 4 decimals and strip
// trailing zeros so "22.0269..." becomes "22.0269" and "100.0000" becomes
// "100", not a 15-digit number chewing up the whole row.
function fmtQty(q) {
  const n = Number(q);
  if (!isFinite(n)) return String(q);
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function initiateTrade(side, explicitQuantity, maxAllotment) {
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
  pendingTrade = { side, quantity, symbol: selectedSymbol, estPrice, maxAllotment: !!maxAllotment };

  if (getTradePref("skipTradeReview")) {
    executeTrade();
    return;
  }

  document.getElementById("reviewAction").textContent = side === "buy" ? "Buy" : "Sell";
  document.getElementById("reviewAction").style.color = side === "buy" ? "var(--green)" : "var(--red)";
  document.getElementById("reviewSymbol").textContent = selectedSymbol;
  document.getElementById("reviewShares").textContent = maxAllotment ? "~" + fmtQty(quantity) : fmtQty(quantity);
  document.getElementById("reviewPrice").textContent = q ? `${q.currency} ${estPrice.toFixed(2)}` : "—";
  document.getElementById("reviewTotal").textContent = maxAllotment
    ? `~$${(quantity * estPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} (exact amount confirmed at execution)`
    : `$${(quantity * estPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  showTradeModalState("review");
}

document.getElementById("reviewCancelBtn").addEventListener("click", () => {
  pendingTrade = null;
  showTradeModalState("main");
});

document.getElementById("reviewConfirmBtn").addEventListener("click", () => {
  if (document.getElementById("skipReviewCheckbox").checked) setTradePref("skipTradeReview", true);
  executeTrade();
});

async function executeTrade() {
  if (!pendingTrade) return;
  const msg = document.getElementById("tradeMsg");
  try {
    const result = await api(`/portfolios/${currentPortfolioId}/trades`, {
      method: "POST",
      body: JSON.stringify({
        symbol: pendingTrade.symbol,
        side: pendingTrade.side,
        quantity: pendingTrade.quantity,
        maxAllotment: pendingTrade.maxAllotment,
      }),
    });
    const qtyDisplay = fmtQty(result.quantity);
    const summary = `${result.side === "buy" ? "Bought" : "Sold"} ${qtyDisplay} ${result.symbol} @ $${result.price.toFixed(2)}`;
    pendingTrade = null;
    refreshCurrentPortfolio();
    if (result.side === "buy") setTimeout(() => onboardingPortfolioConfigured(), 2500);

    if (getTradePref("skipOrderFilled")) {
      showTradeModalState("main");
      msg.textContent = `✓ ${summary}`;
      msg.style.color = "var(--green)";
      setTimeout(() => {
        if (msg.textContent === `✓ ${summary}`) msg.textContent = "";
      }, 3000);
    } else {
      document.getElementById("filledSummary").textContent = summary;
      showTradeModalState("filled");
    }
  } catch (err) {
    showTradeModalState("main");
    msg.textContent = err.message;
    msg.style.color = "var(--red)";
  }
}

document.getElementById("filledDoneBtn").addEventListener("click", () => {
  if (document.getElementById("skipFilledCheckbox").checked) setTradePref("skipOrderFilled", true);
  document.getElementById("tradeMsg").textContent = "";
  showTradeModalState("main");
});

function currentAllotmentInfo() {
  if (!latestPortfolioData) return { availableAllotment: 0, existingQty: 0 };
  const existingPos = latestPortfolioData.positions.find((p) => p.symbol === selectedSymbol);
  const existingCostBasis = existingPos ? existingPos.avgCost * existingPos.quantity : 0;
  // Degen Hours (Hourly) has no 10% cap — "% left to allocate" should show
  // real remaining cash, not a capped figure that no longer matches what
  // the server will actually allow.
  const availableAllotment = latestPortfolioData.isDegenHours
    ? latestPortfolioData.cash
    : Math.max(0, latestPortfolioData.totalValue * CLIENT_MAX_POSITION_PCT - existingCostBasis);
  return { availableAllotment, existingQty: existingPos ? existingPos.quantity : 0 };
}

function updatePctHints() {
  const { availableAllotment, existingQty } = currentAllotmentInfo();
  const el = document.getElementById("pctReferenceLine");
  if (el) el.textContent = `~$${availableAllotment.toFixed(2)} left to allocate  ·  ${fmtQty(existingQty)} shares held`;
}

function buyPercentOfAllotment(pct) {
  const q = latestQuotes[selectedSymbol];
  if (!q) return;
  const { availableAllotment } = currentAllotmentInfo();
  const cost = availableAllotment * (pct / 100);
  const quantity = cost / q.price;
  // 100% specifically asks for the true maximum, right at the boundary —
  // the quantity computed here is only an ESTIMATE for the review screen.
  // Price ticks continuously and the review step introduces a real pause,
  // so the actual execution recomputes this fresh, server-side, against
  // the live price at that exact moment — see initiateTrade/maxAllotment.
  initiateTrade("buy", quantity, pct === 100);
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

// ---- Trade mode toggle (Percentage / Shares) ----
document.querySelectorAll(".trade-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    tradeMode = btn.dataset.mode;
    document.querySelectorAll(".trade-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("pctModeBlock").style.display = tradeMode === "pct" ? "block" : "none";
    document.getElementById("sharesModeBlock").style.display = tradeMode === "shares" ? "block" : "none";
  });
});

// ---- Percentage chip selection (doesn't trade yet — just picks the value) ----
document.querySelectorAll(".pct-quick-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedPct = parseFloat(btn.dataset.pct);
    document.querySelectorAll(".pct-quick-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("customPct").value = "";
  });
});
document.getElementById("customPct").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  if (val > 0 && val <= 100) {
    selectedPct = val;
    document.querySelectorAll(".pct-quick-btn").forEach((b) => b.classList.remove("active"));
  }
});

// ---- Single Buy/Sell pair — dispatches based on the active mode ----
document.getElementById("buyBtn").addEventListener("click", () => {
  if (tradeMode === "shares") {
    initiateTrade("buy", parseFloat(document.getElementById("tradeShares").value));
  } else {
    buyPercentOfAllotment(selectedPct);
  }
});
document.getElementById("sellBtn").addEventListener("click", () => {
  if (tradeMode === "shares") {
    initiateTrade("sell", parseFloat(document.getElementById("tradeShares").value));
  } else {
    sellPercentOfPosition(selectedPct);
  }
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

// Delegated listener, attached once at page load — survives any number of
// re-renders of #positionsTable since it lives on a stable ancestor, not
// the rows themselves. Clicking anywhere in a position row opens the same
// trade modal used from the watchlist.
document.getElementById("positionsTable").addEventListener("click", (e) => {
  const row = e.target.closest(".position-row");
  if (row) openTradeModal(row.dataset.symbol);
});

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
          return `<tr class="watch-row position-row" data-symbol="${pos.symbol}"><td class="mono">${pos.symbol}</td><td class="mono">${fmtQty(pos.quantity)}</td><td>$${pos.avgCost.toFixed(2)}</td><td>$${pos.price.toFixed(2)}</td><td class="mono">${pctOfPortfolio.toFixed(1)}%</td><td class="${cls}">${pos.unrealizedPL >= 0 ? "+" : ""}$${pos.unrealizedPL.toFixed(2)}</td></tr>`;
        })
        .join("") || `<tr><td colspan="6" style="color:var(--text-dim);">No positions yet — buy something!</td></tr>`;
    // Delegated listener (attached once, outside this function — see below)
    // handles clicks on .position-row regardless of how many times this
    // table gets re-rendered, so there's no window where a freshly-rendered
    // row is briefly missing its own listener.

    renderAllocationDonut(p);
    renderPositionSummary();
    renderPortfolioTotalInModal();
    renderWatchlist();
    renderMyWatchlist();
    updatePctHints();

    // Order history
    const trades = await api(`/portfolios/${currentPortfolioId}/trades`);
    const historyBody = document.getElementById("orderHistoryTable");
    historyBody.innerHTML =
      trades
        .slice(0, 20)
        .map(
          (t) =>
            `<tr><td class="mono" style="font-size:11px;">${new Date(t.timestamp).toLocaleString()}</td><td class="${t.side === "buy" ? "up" : "down"}">${t.side.toUpperCase()}</td><td class="mono">${t.symbol}</td><td class="mono">${fmtQty(t.quantity)}</td><td>$${t.price.toFixed(2)}</td></tr>`
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
    const sub = openCount > 0 ? `${openCount} of ${cat.levels.length} contests open right now` : "Not open right now — check price levels for next open time";
    categories.push({
      kind: "satellite",
      name: `${cat.icon} ${cat.name}`,
      sub,
      buttonLabel: "View contests",
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
  const prizeNoun = cat.id === "weekly_qualifier" ? "Main Event ticket" : "Runner-level ticket";
  body.innerHTML = cat.levels
    .map((lvl) => {
      const isOpen = lvl.status === "open";
      const isPending = lvl.status === "pending";
      const isFreeroll = lvl.priceLevel === "free";
      const payout = isOpen
        ? isFreeroll
          ? lvl.ticketsProjected > 0
            ? `A ${prizeNoun} is banked and up for grabs`
            : `No ${prizeNoun} banked yet — still a great free rep`
          : lvl.ticketsProjected > 0
            ? `${lvl.ticketsProjected} ${prizeNoun}${lvl.ticketsProjected === 1 ? "" : "s"} funded + ${lvl.remainderProjected.toLocaleString()} STONK to next`
            : `${lvl.remainderProjected.toLocaleString()} STONK pooled toward first ${prizeNoun}`
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
              : w.prizeType === "runner_entry"
                ? "🎯 Free Runner Entry"
                : w.prizeType === "bonus_freeroll"
                  ? "🎁 Bonus Freeroll Entry"
                  : `${(w.prizeAmount || 0).toLocaleString()} STONK`;
        return `<div class="portfolio-row">
        <div class="portfolio-row-main">
          <div class="portfolio-row-label">${w.displayName} <span style="color:var(--text-dim);font-weight:400;">won ${prizeLabel}</span></div>
          <div class="portfolio-row-sub mono">${w.name} · ${new Date(w.resolvedAt).toLocaleDateString()}</div>
        </div>
      </div>`;
      })
      .join("") || `<div class="history-empty">No resolved contests yet — check back after the first contests wrap up.</div>`;
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
    if (allocations.length > 0) setTimeout(() => onboardingPortfolioConfigured(), 1600);
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
  const existing = scheduledOrdersByPortfolio[portfolioId];
  document.getElementById("scheduledOrderContextLabel").textContent = existing
    ? `${label} — adjusting your queued order, fires at ${new Date(existing.targetOpenAt).toLocaleString()}.`
    : `${label} — fires at the next real market open (9:30am ET). Free to trade normally after.`;
  document.getElementById("scheduledOrderRows").innerHTML = "";
  if (existing && existing.allocations.length > 0) {
    existing.allocations.forEach((a) => addAllocRow(a.symbol, a.percent, "scheduledOrderRows", "scheduledTotalPct", "schedRow"));
  } else {
    const symbols = window.__symbols || [];
    const rowCount = Math.min(10, symbols.length || 10);
    for (let i = 0; i < rowCount; i++) {
      addAllocRow(symbols[i]?.symbol || "", 10, "scheduledOrderRows", "scheduledTotalPct", "schedRow");
    }
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
