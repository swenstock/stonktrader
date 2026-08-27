const base = process.env.SBC_BASE_URL || 'http://127.0.0.1:3456/api';

async function call(path, { method='GET', token='', body } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type':'application/json', ...(token ? {authorization:`Bearer ${token}`} : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(out)}`);
  return out;
}

async function expectError(path, options, text) {
  try { await call(path, options); }
  catch (err) {
    if (!String(err.message).includes(text)) throw err;
    return;
  }
  throw new Error(`Expected ${path} to fail with ${text}`);
}

const stamp = `${Date.now()}-${Math.floor(Math.random()*1e6)}`;
const buyerEmail = `buyer-${stamp}@example.com`;
const sellerEmail = `seller-${stamp}@example.com`;

const cfg = await call('/config');
if (cfg.tiers.runner.playerPrice !== 100 || cfg.tiers.clerk.playerPrice !== 200 || cfg.tiers.trader.playerPrice !== 400 || cfg.tiers.junior.playerPrice !== 1050) {
  throw new Error('V45 tier prices do not match locked config');
}

const buyer = await call('/auth/signup', { method:'POST', body:{displayName:`Buyer${stamp.slice(-5)}`,email:buyerEmail,password:'testpass123'} });
const seller = await call('/auth/signup', { method:'POST', body:{displayName:`Seller${stamp.slice(-5)}`,email:sellerEmail,password:'testpass123'} });

// ---- BACKEND LOCKDOWN / MAIN EVENT RETIREMENT ----
await expectError('/contests/999999/enter', { method:'POST', token:buyer.token, body:{} }, '410');
await expectError('/allocations', { method:'POST', token:buyer.token, body:{targetType:'contest',tierId:'main_event',allocations:[]} }, '410');
const sourcesAfterRetirement = await call('/leaderboard-v45/sources', { token:buyer.token });
if (Array.isArray(sourcesAfterRetirement.contests) && sourcesAfterRetirement.contests.length !== 0) throw new Error('Main Event must not appear as an active leaderboard source');
const origin = base.replace(/\/api\/?$/, '');
const retiredV45 = await fetch(origin + '/v45/index.html', { redirect:'follow' });
if (!retiredV45.ok || new URL(retiredV45.url).pathname !== '/') throw new Error('Legacy /v45 frontend did not redirect to current root product');
await call('/dev/fund', { method:'POST', token:buyer.token, body:{amount:20000} });
await call('/dev/fund', { method:'POST', token:seller.token, body:{amount:20000} });

// Ask the TEST_MODE scheduler for the rooms it actually created first. Then
// derive a clock instant inside the current Degen room, rather than assuming
// the runner's wall-clock date. That makes the end-to-end test deterministic.
const floor = await call('/satellites', { token:buyer.token });
if (floor.payoutEngine !== 'v45') throw new Error('Trading Floor API is not using V45 payout engine');
const fullDay = floor.categories.find(c=>c.id==='full_day');
const degen = floor.categories.find(c=>c.id==='hourly');
const freeStandard = fullDay?.levels?.find(l=>l.priceLevel==='free' && l.status==='open');
const degenRunner = degen?.levels?.find(l=>l.priceLevel==='runner' && l.status==='open');
if (!freeStandard?.id || !degenRunner?.id) throw new Error('Expected TEST_MODE standard freeroll and Degen Runner rooms to be open');

const degenOpenMs = new Date(degenRunner.opensAt).getTime();
const degenLockMs = new Date(degenRunner.locksAt).getTime();
if (!Number.isFinite(degenOpenMs) || !Number.isFinite(degenLockMs) || degenLockMs <= degenOpenMs) throw new Error('Degen test room has invalid time bounds');
const tradeInstant = new Date(Math.min(degenOpenMs + 10*60*1000, degenLockMs - 10*60*1000));
const tradeClock = await call('/test-clock', { method:'POST', token:buyer.token, body:{datetime:tradeInstant.toISOString()} });
if (!tradeClock.now) throw new Error('Test Clock did not return an authoritative time');

// ---- REAL PAPER-TRADING PATH: STANDARD VS DEGEN PERCENTAGE SEMANTICS ----
const standardEntry = await call(`/satellites/${freeStandard.id}/enter`, { method:'POST', token:buyer.token, body:{} });
let standardP = await call(`/portfolios/${standardEntry.portfolioId}`, { token:buyer.token });
if (!standardP.tradingAllowed || standardP.isDegenHours) throw new Error(`Standard TEST_MODE portfolio rules are wrong: ${JSON.stringify({tradingAllowed:standardP.tradingAllowed,isDegenHours:standardP.isDegenHours,message:standardP.tradingMessage,now:standardP.serverNow,opensAt:freeStandard.opensAt,locksAt:freeStandard.locksAt})}`);
await call(`/portfolios/${standardEntry.portfolioId}/trades`, { method:'POST', token:buyer.token, body:{symbol:'NVDA',side:'buy',percent:25} });
standardP = await call(`/portfolios/${standardEntry.portfolioId}`, { token:buyer.token });
if (Math.abs(standardP.cash - 97500) > 2) throw new Error(`Standard 25% quick buy should target 2.5% portfolio / ~$97,500 cash, got ${standardP.cash}`);
await call(`/portfolios/${standardEntry.portfolioId}/trades`, { method:'POST', token:buyer.token, body:{symbol:'NVDA',side:'buy',percent:100} });
standardP = await call(`/portfolios/${standardEntry.portfolioId}`, { token:buyer.token });
if (Math.abs(standardP.cash - 90000) > 3) throw new Error(`Standard 100% quick buy should reach 10% cost basis / ~$90,000 cash, got ${standardP.cash}`);
await expectError(`/portfolios/${standardEntry.portfolioId}/trades`, { method:'POST', token:buyer.token, body:{symbol:'NVDA',side:'buy',quantity:1} }, '10%');

const degenEntry = await call(`/satellites/${degenRunner.id}/enter`, { method:'POST', token:buyer.token, body:{} });
let degenP = await call(`/portfolios/${degenEntry.portfolioId}`, { token:buyer.token });
if (!degenP.tradingAllowed || !degenP.isDegenHours) throw new Error('Degen portfolio rules are wrong');
await call(`/portfolios/${degenEntry.portfolioId}/trades`, { method:'POST', token:buyer.token, body:{symbol:'NVDA',side:'buy',percent:50} });
degenP = await call(`/portfolios/${degenEntry.portfolioId}`, { token:buyer.token });
if (Math.abs(degenP.cash - 50000) > 3) throw new Error(`Degen 50% buy should use half available cash, got ${degenP.cash}`);
await call(`/portfolios/${degenEntry.portfolioId}/trades`, { method:'POST', token:buyer.token, body:{symbol:'NVDA',side:'sell',percent:50} });
degenP = await call(`/portfolios/${degenEntry.portfolioId}`, { token:buyer.token });
if (Math.abs(degenP.cash - 75000) > 5) throw new Error(`Degen 50% sell should liquidate half the position, got ${degenP.cash}`);

// ---- FULL FIELD / FIND ME ----
const board = await call(`/leaderboard-v45/satellite/${degenRunner.id}`, { token:buyer.token });
if (!Array.isArray(board.rows) || !board.rows.some(r=>r.isMine)) throw new Error('Find Me board did not identify the signed-in trader');
if (board.moneyLineRank !== Math.max(1, Math.ceil(board.fieldSize * 0.10))) throw new Error('Money line is not top 10%');

// ---- BID -> SELL TO BID ----
const mintedRunner = await call('/dev/tickets', { method:'POST', token:seller.token, body:{ticketType:'runner',quantity:1} });
const runnerTicketId = mintedRunner.tickets[0].id;
const bid = await call('/ticket-market/bids', { method:'POST', token:buyer.token, body:{ticketType:'runner',bidPrice:150} });
const runnerBook = await call('/ticket-market/book/runner');
if (runnerBook.highestBid !== 150) throw new Error('Runner highest bid not visible in book');
await call(`/ticket-market/bids/${bid.id}/sell`, { method:'POST', token:seller.token, body:{ticketId:runnerTicketId} });
const buyerAfterBid = await call('/tickets', { token:buyer.token });
if ((buyerAfterBid.inventory.runner?.owned || 0) !== 1) throw new Error('Runner ticket did not transfer to bid buyer');

// ---- OFFER -> BUY OFFER ----
const mintedClerk = await call('/dev/tickets', { method:'POST', token:seller.token, body:{ticketType:'clerk',quantity:1} });
const clerkTicketId = mintedClerk.tickets[0].id;
const offer = await call('/ticket-market/offers', { method:'POST', token:seller.token, body:{ticketId:clerkTicketId,askPrice:180} });
const clerkBook = await call('/ticket-market/book/clerk');
if (clerkBook.lowestAsk !== 180) throw new Error('Clerk lowest ask not visible in book');
await call(`/ticket-market/offers/${offer.id}/buy`, { method:'POST', token:buyer.token, body:{} });
const buyerAfterOffer = await call('/tickets', { token:buyer.token });
if ((buyerAfterOffer.inventory.clerk?.owned || 0) !== 1) throw new Error('Clerk ticket did not transfer to offer buyer');
const finalRunnerBook = await call('/ticket-market/book/runner');
if (Number(finalRunnerBook.exchangeFeePct) !== 0.05) throw new Error('Canonical exchange fee must be 5%');

// ---- TEST CLOCK + DETERMINISTIC SIM DATA ----
const clock = await call('/test-clock', { method:'POST', token:buyer.token, body:{datetime:'2026-08-17T09:30'} });
const instant = new Date(clock.now);
if (instant.getUTCHours() !== 13 || instant.getUTCMinutes() !== 30) throw new Error(`9:30 ET August Test Clock did not map to 13:30Z: ${clock.now}`);
const q1 = await call('/sim-market/quotes?symbols=NVDA,MSFT');
if (q1.length !== 2 || q1.some(q=>q.source!=='sim')) throw new Error('Simulated quote feed invalid');

// ---- ECONOMIC PREVIEW ----
const payout = await call('/dev/payout-preview?tier=trader&field=100');
if (payout.status !== 'OK' || payout.paidPlaces !== 10 || !payout.reconciliation?.entry || !payout.reconciliation?.prize) {
  throw new Error('Trader-100 payout preview failed reconciliation');
}
const free = await call('/dev/payout-preview?tier=free&field=1000&reserve=45500');
if (free.badgesAwarded !== 1 || free.badgeSpend !== 40000 || free.cashDistributed !== 0 || free.reserveRemainder !== 5500) {
  throw new Error('Freeroll carry-forward rule is wrong');
}

console.log('V45 end-to-end simulated smoke test passed');
