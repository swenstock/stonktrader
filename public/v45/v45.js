(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const INTRO_KEY = 'sbcDisableMainTutorialV45Web';
  const VIEW_KEY = (v) => `sbcDisableViewTutorialV45Web:${v}`;
  const state = {
    token: localStorage.getItem('token') || '',
    displayName: localStorage.getItem('displayName') || '',
    config: null,
    economics: null,
    satellites: null,
    quotes: [],
    account: null,
    tickets: null,
    marketBook: null,
    marketStatus: null,
    activeView: 'lobby',
    category: 'weekly_qualifier',
    ticketType: 'main_event',
  };

  const TICKET_NAMES = {
    main_event: 'MAIN EVENT', junior: 'JR. STONKBROKER', trader: 'TRADER', clerk: 'CLERK', runner: 'RUNNER'
  };
  const CATEGORY_ORDER = ['weekly_qualifier','full_day','morning','afternoon','hourly','race_to_close'];

  function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
  }

  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) clearSession(false);
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return body;
  }

  function fmt(n, max = 0) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: max });
  }
  function money(n) { return `${fmt(n, 2)} STONK`; }
  function pctClass(n) { return Number(n) >= 0 ? 'up' : 'down'; }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function openModal(id) { $(`#${id}`)?.classList.remove('hidden'); }
  function closeModal(id) { $(`#${id}`)?.classList.add('hidden'); }

  function clearSession(reload = true) {
    state.token = '';
    state.displayName = '';
    state.account = null;
    state.tickets = null;
    localStorage.removeItem('token');
    localStorage.removeItem('displayName');
    updateUserUI();
    if (reload) refreshAll();
  }

  function setSession(token, displayName) {
    state.token = token;
    state.displayName = displayName || 'Trader';
    localStorage.setItem('token', token);
    localStorage.setItem('displayName', state.displayName);
    closeModal('authModal');
    updateUserUI();
    refreshAll();
  }

  function requireLogin() {
    if (state.token) return true;
    openModal('authModal');
    return false;
  }

  function updateUserUI() {
    const authBtn = $('#authBtn');
    const userState = $('#userState');
    if (state.token) {
      const bal = state.account ? ` • ${fmt(state.account.stonkBalance,2)} STONK` : '';
      authBtn.textContent = 'LOG OUT';
      userState.textContent = `${state.displayName || 'TRADER'}${bal}`;
    } else {
      authBtn.textContent = 'SIGN IN';
      userState.textContent = 'BROWSE MODE';
    }
  }

  async function loadPublic() {
    const results = await Promise.allSettled([
      api('/config'),
      api('/economics'),
      api('/satellites'),
      api('/sim-market/quotes?symbols=NVDA,MSFT,AAPL,TSLA,COIN,META'),
      api('/sim-market/status'),
      api(`/ticket-market/book/${state.ticketType}`),
    ]);
    if (results[0].status === 'fulfilled') state.config = results[0].value;
    if (results[1].status === 'fulfilled') state.economics = results[1].value;
    if (results[2].status === 'fulfilled') state.satellites = results[2].value;
    if (results[3].status === 'fulfilled') state.quotes = results[3].value;
    if (results[4].status === 'fulfilled') state.marketStatus = results[4].value;
    if (results[5].status === 'fulfilled') state.marketBook = results[5].value;
  }

  async function loadPrivate() {
    if (!state.token) return;
    const results = await Promise.allSettled([api('/account'), api('/tickets')]);
    if (results[0].status === 'fulfilled') state.account = results[0].value;
    if (results[1].status === 'fulfilled') state.tickets = results[1].value;
  }

  async function refreshAll() {
    try {
      await loadPublic();
      await loadPrivate();
      renderAll();
    } catch (err) {
      toast(err.message);
    }
  }

  function renderAll() {
    updateUserUI();
    renderStatus();
    renderLobby();
    renderFloor();
    renderExchange();
    if (state.activeView === 'my') renderMyContests();
  }

  function renderStatus() {
    $('#marketMode').textContent = state.config?.marketDataSource === 'sim' ? 'SIM DATA • SERVER DRIVEN' : String(state.config?.marketDataSource || 'DATA').toUpperCase();
    const now = state.marketStatus?.now;
    $('#serverNow').textContent = now ? new Date(now).toLocaleString([], { weekday:'short', hour:'numeric', minute:'2-digit', timeZone:'America/New_York', timeZoneName:'short' }) : 'SERVER TIME —';
    const testActive = !!state.marketStatus?.testClock?.testModeActive;
    $('#clockBtn').classList.toggle('hidden', !testActive);
  }

  function renderLobby() {
    const main = state.economics?.mainEvent;
    const committed = Number(main?.committedStonk || 0);
    const target = Number(main?.targetStonk || 733332);
    const percent = Number(main?.percentFunded || 0);
    $('#fundPct').textContent = `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
    $('#fundFill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
    $('#fundCurrent').textContent = `${fmt(committed)} STONK`;
    $('#fundTarget').textContent = `Target: ${fmt(target)} STONK`;
    $('#fundReserve').textContent = `${fmt(committed)} STONK`;

    const book = state.ticketType === 'main_event' ? state.marketBook : null;
    $('#meBid').textContent = book?.highestBid ? fmt(book.highestBid) : '—';
    $('#meAsk').textContent = book?.lowestAsk ? fmt(book.lowestAsk) : '—';

    $('#quoteTape').innerHTML = (state.quotes || []).map(q => `
      <div class="tape-card">
        <b>${escapeHtml(q.symbol)}</b><small>${escapeHtml(q.exchange || '')}</small>
        <strong>$${Number(q.price).toFixed(2)}</strong>
        <span class="${pctClass(q.changePct)}">${Number(q.changePct) >= 0 ? '+' : ''}${Number(q.changePct).toFixed(2)}%</span>
      </div>`).join('') || '<div class="empty-state">Waiting for simulated market feed…</div>';
  }

  function tierSort(level) {
    return ({free:0,runner:1,low:2,mid:3,high:4})[level] ?? 99;
  }
  function orderedCategories() {
    const cats = state.satellites?.categories || [];
    return [...cats].sort((a,b) => CATEGORY_ORDER.indexOf(a.id) - CATEGORY_ORDER.indexOf(b.id));
  }
  function renderFloor() {
    const cats = orderedCategories();
    if (!cats.length) {
      $('#categoryTabs').innerHTML = '';
      $('#floorGrid').innerHTML = '<div class="empty-state">Contest schedule is loading…</div>';
      return;
    }
    if (!cats.some(c => c.id === state.category)) state.category = cats[0].id;
    $('#categoryTabs').innerHTML = cats.map(c => `<button data-cat="${c.id}" class="${c.id===state.category?'active':''}">${c.icon || ''} ${escapeHtml(c.name)}</button>`).join('');
    $$('#categoryTabs [data-cat]').forEach(btn => btn.onclick = () => { state.category = btn.dataset.cat; renderFloor(); });

    const cat = cats.find(c => c.id === state.category);
    const levels = [...(cat?.levels || [])].sort((a,b)=>tierSort(a.priceLevel)-tierSort(b.priceLevel));
    $('#floorGrid').innerHTML = levels.map(l => floorCard(cat,l)).join('');
    $$('#floorGrid [data-enter]').forEach(btn => btn.onclick = () => handleFloorAction(btn.dataset.enter));
  }

  function floorCard(cat, l) {
    const price = Number(l.entryFee || 0);
    const isOpen = l.status === 'open';
    const canEnterLive = isOpen && (l.priceLevel === 'free' || cat.id === 'hourly' || cat.id === 'race_to_close');
    const canReserve = !isOpen;
    let label = canEnterLive ? 'ENTER NOW →' : canReserve ? 'RESERVE →' : 'REGISTRATION CLOSED';
    if (l.joined) label = l.myEntryCount ? `ENTERED × ${l.myEntryCount}` : 'ENTERED';
    const disabled = !canEnterLive && !canReserve;
    const action = encodeURIComponent(JSON.stringify({id:l.id,tierId:cat.id,priceLevel:l.priceLevel,status:l.status}));
    const opens = l.opensAt ? new Date(l.opensAt).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}) : '—';
    return `<article class="floor-card ${l.priceLevel}">
      <div class="tier-name">${escapeHtml(l.priceLevelName)}</div>
      <div class="price">${price ? `${fmt(price)} STONK` : 'FREE'}</div>
      <div class="usd">${price && Number.isFinite(l.entryFeeUsd) ? `≈ $${Number(l.entryFeeUsd).toFixed(2)}` : 'ZERO-RISK ENTRY'}</div>
      <div class="meta">${escapeHtml(cat.name)}<br>${isOpen ? 'OPEN NOW' : `NEXT: ${opens}`}<br>${fmt(l.entrantCount || 0)} ENTRIES</div>
      <button class="enter ${canEnterLive?'green':canReserve?'blue':'ghost'}" data-enter="${action}" ${disabled?'disabled':''}>${label}</button>
    </article>`;
  }

  async function handleFloorAction(encoded) {
    if (!requireLogin()) return;
    const a = JSON.parse(decodeURIComponent(encoded));
    try {
      if (a.status === 'open') {
        if (!a.id) throw new Error('Contest instance is not ready yet.');
        const r = await api(`/satellites/${a.id}/enter`, { method:'POST', body:'{}' });
        toast(`Entry created. Portfolio #${r.portfolioId}`);
      } else {
        await api('/allocations', { method:'POST', body: JSON.stringify({ targetType:'satellite', tierId:a.tierId, priceLevel:a.priceLevel, allocations:[] }) });
        toast('Reserved. You can set the portfolio before it opens.');
      }
      await refreshAll();
    } catch (err) { toast(err.message); }
  }

  async function renderMyContests() {
    const gate = $('#myGate');
    const list = $('#myList');
    if (!state.token) {
      gate.classList.remove('hidden');
      gate.innerHTML = '<h2>SIGN IN TO SEE YOUR CONTESTS</h2><p>Your live entries, queued portfolios and results will live here.</p><button id="mySignIn" class="green">SIGN IN</button>';
      list.innerHTML = '';
      $('#mySignIn').onclick = () => openModal('authModal');
      return;
    }
    gate.classList.add('hidden');
    try {
      const portfolios = await api('/portfolios');
      if (!portfolios.length) {
        list.innerHTML = '<div class="empty-state"><h2>NO CONTESTS YET</h2><p>Enter or reserve something on the Trading Floor.</p></div>';
        return;
      }
      list.innerHTML = portfolios.map(p => `
        <button class="portfolio-card" data-portfolio="${p.id}">
          <div><h3>${escapeHtml(p.label)}</h3><p>${escapeHtml(p.context?.type || 'contest')} • ${escapeHtml(p.context?.status || '')}</p></div>
          <div class="metric"><small>VALUE</small><b>$${fmt(p.totalValue,2)}</b></div>
          <div class="metric"><small>P&L</small><b class="${pctClass(p.pl)}">${p.pl>=0?'+':''}$${fmt(p.pl,2)}</b></div>
          <div class="metric"><small>CASH</small><b>$${fmt(p.cash,2)}</b></div>
        </button>`).join('');
      $$('[data-portfolio]', list).forEach(b => b.onclick = () => showPortfolio(b.dataset.portfolio));
    } catch (err) { list.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
  }

  async function showPortfolio(id) {
    try {
      const p = await api(`/portfolios/${id}`);
      const rows = (p.positions || []).map(x => `${x.symbol}: ${fmt(x.quantity,2)} sh • $${fmt(x.value,2)} • P&L ${x.unrealizedPL>=0?'+':''}$${fmt(x.unrealizedPL,2)}`).join('\n');
      alert(`${p.label}\n\nValue: $${fmt(p.totalValue,2)}\nP&L: ${p.pl>=0?'+':''}$${fmt(p.pl,2)}\nCash: $${fmt(p.cash,2)}\n\n${rows || '100% cash — no positions yet.'}\n\nFull chart-first execution screen is the next frontend wiring step.`);
    } catch (err) { toast(err.message); }
  }

  async function loadBook(type = state.ticketType) {
    state.ticketType = type;
    try {
      state.marketBook = await api(`/ticket-market/book/${type}`);
      if (state.token) state.tickets = await api('/tickets');
      renderExchange();
      if (type === 'main_event') renderLobby();
    } catch (err) { toast(err.message); }
  }

  function renderExchange() {
    const types = state.config?.ticketTypes || ['main_event','junior','trader','clerk','runner'];
    $('#ticketTabs').innerHTML = types.map(t => `<button data-ticket-type="${t}" class="${t===state.ticketType?'active':''}">${TICKET_NAMES[t] || t}</button>`).join('');
    $$('[data-ticket-type]').forEach(b => b.onclick = () => loadBook(b.dataset.ticketType));

    const inv = state.tickets?.inventory || {};
    $('#inventoryLine').textContent = state.token
      ? types.map(t => `${TICKET_NAMES[t] || t}: YOU OWN ${inv[t]?.owned || 0}`).join('   •   ')
      : 'Sign in to see your ticket inventory.';

    const book = state.marketBook || {bids:[],offers:[]};
    $('#bookBid').textContent = book.highestBid ? `${fmt(book.highestBid)} STONK` : '—';
    $('#bookAsk').textContent = book.lowestAsk ? `${fmt(book.lowestAsk)} STONK` : '—';
    $('#bookType').textContent = TICKET_NAMES[state.ticketType] || state.ticketType.toUpperCase();
    $('#bidRows').innerHTML = book.bids?.length ? book.bids.map(b => `
      <div class="order-row"><div><strong>${fmt(b.bidPrice)} STONK</strong><small>${escapeHtml(b.buyerDisplayName || 'Buyer')}</small></div><small>1 TICKET</small><button data-sell-bid="${b.id}" ${b.isMine?'disabled':''}>SELL TO BID</button></div>`).join('') : '<div class="empty-state">NO ACTIVE BIDS</div>';
    $('#offerRows').innerHTML = book.offers?.length ? book.offers.map(o => `
      <div class="order-row"><div><strong>${fmt(o.askPrice)} STONK</strong><small>${escapeHtml(o.sellerDisplayName || 'Seller')}</small></div><small>1 TICKET</small><button data-buy-offer="${o.id}" ${o.isMine?'disabled':''}>BUY OFFER</button></div>`).join('') : '<div class="empty-state">NO ACTIVE OFFERS</div>';
    $$('[data-buy-offer]').forEach(b => b.onclick = () => buyOffer(b.dataset.buyOffer));
    $$('[data-sell-bid]').forEach(b => b.onclick = () => sellToBid(b.dataset.sellBid));
  }

  function availableTicket(type) {
    return state.tickets?.tickets?.find(t => (t.ticket_type || 'main_event') === type && t.status === 'unredeemed');
  }
  async function placeBid() {
    if (!requireLogin()) return;
    const p = Number(prompt(`Bid how many STONK for ONE ${TICKET_NAMES[state.ticketType]} ticket?`));
    if (!(p > 0)) return;
    try {
      await api('/ticket-market/bids', {method:'POST',body:JSON.stringify({ticketType:state.ticketType,bidPrice:p})});
      toast('Bid posted and funded.'); await loadBook(); await loadPrivate(); updateUserUI();
    } catch (err) { toast(err.message); }
  }
  async function postOffer() {
    if (!requireLogin()) return;
    const ticket = availableTicket(state.ticketType);
    if (!ticket) return toast(`You do not have an available ${TICKET_NAMES[state.ticketType]} ticket to offer.`);
    const p = Number(prompt(`Ask how many STONK for ticket #${ticket.id}?`));
    if (!(p > 0)) return;
    try {
      await api('/ticket-market/offers', {method:'POST',body:JSON.stringify({ticketId:ticket.id,askPrice:p})});
      toast('Offer posted.'); await loadBook();
    } catch (err) { toast(err.message); }
  }
  async function buyOffer(id) {
    if (!requireLogin()) return;
    try { await api(`/ticket-market/offers/${id}/buy`, {method:'POST',body:'{}'}); toast('Ticket purchased.'); await loadBook(); await loadPrivate(); updateUserUI(); }
    catch (err) { toast(err.message); }
  }
  async function sellToBid(id) {
    if (!requireLogin()) return;
    const ticket = availableTicket(state.ticketType);
    if (!ticket) return toast(`You do not have an available ${TICKET_NAMES[state.ticketType]} ticket to sell.`);
    try { await api(`/ticket-market/bids/${id}/sell`, {method:'POST',body:JSON.stringify({ticketId:ticket.id})}); toast('Ticket sold to bid.'); await loadBook(); await loadPrivate(); updateUserUI(); }
    catch (err) { toast(err.message); }
  }

  function switchView(view, tutorial = true) {
    if (!$(`#view-${view}`)) return;
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
    state.activeView = view;
    if (view === 'my') renderMyContests();
    if (view === 'exchange') loadBook();
    window.scrollTo({top:0,behavior:'smooth'});
    if (tutorial && !$('#welcome').classList.contains('hidden')) return;
    if (tutorial) setTimeout(() => startViewTutorial(view), 180);
  }

  // ---------- Tutorial system ----------
  const VIEW_TUTORIALS = {
    lobby: [
      ['.funding','THE PRIZE IS ALWAYS VISIBLE','This meter uses the actual Main Event Reserve ledger — not ticket count and not resale prices.'],
      ['.primary-actions .green','ENTER THE TRADING FLOOR','Pick the session and tier you want. Start free or move up the ladder.'],
      ['.primary-actions .blue','THE TICKET EXCHANGE','Tickets are player-to-player. Win them, play them, hold them, or sell them.'],
    ],
    floor: [
      ['#categoryTabs','PICK YOUR SESSION','Weekly, Full Day, Morning, Afternoon, Degen Hours and Race to the Close live here.'],
      ['#floorGrid','PICK YOUR TIER','Each tier is its own field. Reserve before open when required, or jump into formats that allow live entry.'],
    ],
    my: [
      ['#myList','YOUR COMMAND CENTER','Every contest appears here through its paper portfolio. This becomes the path into chart-first execution and analysis.'],
    ],
    exchange: [
      ['.ticket-tabs','CHOOSE THE TICKET MARKET','Runner through Main Event each has its own independent market.'],
      ['.bid-book','BIDS ARE BUYERS','A ticket holder can immediately SELL TO BID.'],
      ['.ask-book','OFFERS ARE SELLERS','A buyer can immediately BUY OFFER. One order always means one ticket.'],
    ],
  };
  const FULL_TOUR = [
    ['lobby','.funding','MAIN EVENT FUNDING','This is the heartbeat of SBC.'],
    ['lobby','.primary-actions .green','TRADING FLOOR','This is where competition starts.'],
    ['floor','#floorGrid','PICK YOUR TIER','Choose your level and session.'],
    ['exchange','.order-book','PLAYER-TO-PLAYER TICKETS','Bids left. Offers right.'],
    ['my','#myList','MY CONTESTS','Track every live and archived portfolio here.'],
  ];
  let tutorial = null;

  function tutorialPopover() {
    let el = $('#tutorialPopover');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'tutorialPopover';
    Object.assign(el.style,{position:'fixed',zIndex:'500',width:'min(420px,calc(100vw - 36px))',maxHeight:'calc(100vh - 36px)',overflow:'auto',background:'#07121a',border:'1px solid #a07d12',borderRadius:'14px',padding:'18px',boxShadow:'0 20px 80px #000',display:'none'});
    document.body.appendChild(el);
    return el;
  }
  function clearTarget() { if (tutorial?.target) tutorial.target.style.outline = tutorial.oldOutline || ''; }
  function endTutorial() { clearTarget(); const p=tutorialPopover(); p.style.display='none'; tutorial=null; }
  function positionTutorial(target) {
    const p = tutorialPopover();
    const safe = window.innerWidth < 620 ? 12 : 18, gap=14;
    const w = Math.min(420, window.innerWidth-safe*2);
    p.style.width = `${w}px`; p.style.display='block';
    const h = Math.min(p.offsetHeight || 260, window.innerHeight-safe*2);
    if (!target) { p.style.left=`${Math.max(safe,(window.innerWidth-w)/2)}px`; p.style.top=`${Math.max(safe,(window.innerHeight-h)/2)}px`; return; }
    const r=target.getBoundingClientRect();
    let left=Math.max(safe,Math.min(window.innerWidth-w-safe,r.left));
    let top=r.bottom+gap;
    if(top+h>window.innerHeight-safe) top=r.top-h-gap;
    if(top<safe) top=Math.max(safe,(window.innerHeight-h)/2);
    p.style.left=`${left}px`;p.style.top=`${top}px`;
  }
  function showTutorialStep() {
    clearTarget();
    const step=tutorial.steps[tutorial.index]; if(!step) return endTutorial();
    const [view,selector,title,text] = tutorial.full ? step : [state.activeView,...step];
    if (state.activeView !== view) switchView(view,false);
    const target=$(selector); tutorial.target=target; tutorial.oldOutline=target?.style.outline || '';
    if(target){target.style.outline='3px solid #ffc400';target.scrollIntoView({block:'center',behavior:'smooth'});}
    const p=tutorialPopover();
    p.innerHTML=`<small style="color:#ffc400;font-weight:900;letter-spacing:.12em">${tutorial.index+1} OF ${tutorial.steps.length}</small><h2 style="margin:7px 0 6px">${escapeHtml(title)}</h2><p style="color:#b4c6ce;font-size:12px;line-height:1.5">${escapeHtml(text)}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:7px"><button id="tSkip" class="ghost">SKIP FOR NOW</button><button id="tNext" class="green">${tutorial.index===tutorial.steps.length-1?'DONE':'NEXT →'}</button></div><button id="tDisable" class="danger" style="width:100%;padding:10px;border-radius:8px;margin-top:7px;font-weight:900">DON'T SHOW THIS AGAIN</button>`;
    $('#tSkip').onclick=endTutorial;
    $('#tNext').onclick=()=>{tutorial.index++;showTutorialStep();};
    $('#tDisable').onclick=()=>{localStorage.setItem(tutorial.full?INTRO_KEY:VIEW_KEY(view),'1');endTutorial();};
    setTimeout(()=>positionTutorial(target),100);
  }
  function startViewTutorial(view) {
    if (localStorage.getItem(VIEW_KEY(view)) === '1') return;
    const steps=VIEW_TUTORIALS[view]; if(!steps?.length) return;
    tutorial={steps,index:0,full:false,target:null}; showTutorialStep();
  }
  function startFullTour() { tutorial={steps:FULL_TOUR,index:0,full:true,target:null}; showTutorialStep(); }

  function initWelcome() {
    if (localStorage.getItem(INTRO_KEY) !== '1') $('#welcome').classList.remove('hidden');
    $('#skipIntro').onclick=()=>{closeModal('welcome');setTimeout(()=>startViewTutorial('lobby'),150);};
    $('#disableIntro').onclick=()=>{localStorage.setItem(INTRO_KEY,'1');closeModal('welcome');};
    $('#showAround').onclick=()=>{closeModal('welcome');startFullTour();};
  }

  // ---------- Auth ----------
  function setAuthMode(mode) {
    const login=mode==='login';
    $('#loginTab').classList.toggle('active',login); $('#signupTab').classList.toggle('active',!login);
    $('#loginForm').classList.toggle('hidden',!login); $('#signupForm').classList.toggle('hidden',login);
    $('#authTitle').textContent=login?'SIGN IN':'CREATE ACCOUNT'; $('#authMsg').textContent='';
  }
  $('#loginTab').onclick=()=>setAuthMode('login'); $('#signupTab').onclick=()=>setAuthMode('signup');
  $('#loginForm').onsubmit=async e=>{e.preventDefault();try{const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email:$('#loginEmail').value,password:$('#loginPassword').value})});setSession(r.token,r.displayName);toast('Welcome back.');}catch(err){$('#authMsg').textContent=err.message;}};
  $('#signupForm').onsubmit=async e=>{e.preventDefault();try{const r=await api('/auth/signup',{method:'POST',body:JSON.stringify({displayName:$('#signupName').value,email:$('#signupEmail').value,password:$('#signupPassword').value,referralCode:$('#signupReferral').value})});setSession(r.token,r.displayName);toast('Account created. Start free.');}catch(err){$('#authMsg').textContent=err.message;}};
  $('#authBtn').onclick=()=>{if(state.token){clearSession();toast('Logged out.');}else openModal('authModal');};

  // ---------- Test Clock ----------
  $('#clockBtn').onclick=()=>{ if(!requireLogin()) return; openModal('clockModal'); refreshClock(); };
  $$('[data-clock]').forEach(b=>b.onclick=()=>{$('#clockInput').value=b.dataset.clock;});
  async function refreshClock(){try{const s=await api('/test-clock');$('#clockMsg').textContent=`Server now: ${new Date(s.currentNow).toLocaleString('en-US',{timeZone:'America/New_York',timeZoneName:'short'})}`;}catch(err){$('#clockMsg').textContent=err.message;}}
  $('#setClock').onclick=async()=>{try{if(!$('#clockInput').value)throw new Error('Choose an Eastern date/time first.');await api('/test-clock',{method:'POST',body:JSON.stringify({datetime:$('#clockInput').value})});toast('Test Clock moved.');await refreshAll();await refreshClock();}catch(err){$('#clockMsg').textContent=err.message;}};
  $('#clearClock').onclick=async()=>{try{await api('/test-clock',{method:'DELETE'});toast('Back to real time.');await refreshAll();await refreshClock();}catch(err){$('#clockMsg').textContent=err.message;}};
  $('#fundTest').onclick=async()=>{try{const r=await api('/dev/fund',{method:'POST',body:JSON.stringify({amount:10000})});toast(`Added 10,000 TEST STONK. Balance ${fmt(r.balance,2)}.`);await loadPrivate();updateUserUI();}catch(err){$('#clockMsg').textContent=err.message;}};

  // ---------- Global events ----------
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  $$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id);}));
  $('#placeBid').onclick=placeBid; $('#postOffer').onclick=postOffer; $('#refreshMy').onclick=renderMyContests;
  const help=document.createElement('button');help.id='helpBtn';help.className='ghost';help.textContent='?';help.title='Replay tutorial';help.onclick=()=>startViewTutorial(state.activeView);$('.top-actions').prepend(help);

  // ---------- Boot / polling ----------
  async function boot() {
    initWelcome();
    updateUserUI();
    await refreshAll();
    setInterval(async()=>{
      try{
        state.quotes=await api('/sim-market/quotes?symbols=NVDA,MSFT,AAPL,TSLA,COIN,META');
        state.marketStatus=await api('/sim-market/status');
        renderStatus();renderLobby();
      }catch(_){ }
    },5000);
    setInterval(async()=>{try{state.economics=await api('/economics');renderLobby();}catch(_){}},15000);
  }

  boot();
})();
