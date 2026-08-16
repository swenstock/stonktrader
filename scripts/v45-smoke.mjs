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

const stamp = `${Date.now()}-${Math.floor(Math.random()*1e6)}`;
const buyerEmail = `buyer-${stamp}@example.com`;
const sellerEmail = `seller-${stamp}@example.com`;

const cfg = await call('/config');
if (cfg.tiers.runner.playerPrice !== 100 || cfg.tiers.clerk.playerPrice !== 200 || cfg.tiers.trader.playerPrice !== 400 || cfg.tiers.junior.playerPrice !== 1050) {
  throw new Error('V45 tier prices do not match locked config');
}

const buyer = await call('/auth/signup', { method:'POST', body:{displayName:`Buyer${stamp.slice(-5)}`,email:buyerEmail,password:'testpass123'} });
const seller = await call('/auth/signup', { method:'POST', body:{displayName:`Seller${stamp.slice(-5)}`,email:sellerEmail,password:'testpass123'} });

await call('/dev/fund', { method:'POST', token:buyer.token, body:{amount:20000} });
await call('/dev/fund', { method:'POST', token:seller.token, body:{amount:20000} });

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

// No invented exchange fee unless explicitly configured.
const finalRunnerBook = await call('/ticket-market/book/runner');
if (Number(finalRunnerBook.exchangeFeePct) !== 0) throw new Error('Default exchange fee must remain 0 until product decision');

// ---- TEST CLOCK + DETERMINISTIC SIM DATA ----
const clock = await call('/test-clock', { method:'POST', token:buyer.token, body:{datetime:'2026-08-17T09:30'} });
const instant = new Date(clock.currentNow);
if (instant.getUTCHours() !== 13) throw new Error(`9:30 ET August Test Clock did not map to 13:30Z: ${clock.currentNow}`);
const q1 = await call('/sim-market/quotes?symbols=NVDA,MSFT');
if (q1.length !== 2 || q1.some(q=>q.source!=='sim')) throw new Error('Simulated quote feed invalid');

// ---- ECONOMIC PREVIEW ----
const payout = await call('/dev/payout-preview?tier=trader&field=100');
if (payout.status !== 'OK' || payout.paidPlaces !== 10 || !payout.reconciliation?.entry || !payout.reconciliation?.prize) {
  throw new Error('Trader-100 payout preview failed reconciliation');
}
const free = await call('/dev/payout-preview?tier=free&field=1000');
if (free.paidPlaces !== 100 || free.ticketsRequired !== 200 || free.liabilityRequired !== 20000) {
  throw new Error('Freeroll top-10% requirement is wrong');
}

console.log('V45 end-to-end simulated smoke test passed');
