# Stonk Championship — Paper Trading Platform

A real, multi-user paper trading app: account creation, live quotes (US + foreign
markets), a chart, position tracking, buy/sell, and a live leaderboard. Built to
handle a starting scale of ~10,000 accounts.

## What's real here vs. what's mocked

- **Real**: accounts, auth, the SQLite database, positions, trade execution logic,
  cash-balance math, the leaderboard, the API, the frontend. This is the actual
  code you'd deploy — not a demo shell.
- **Mocked**: the market data. Prices are a random walk seeded from real recent
  levels, not live exchange feeds. See `server/dataProvider.js` for how to swap
  in a real provider (Alpaca for US equities is a fast, free path; foreign
  markets need a vendor per exchange — see "Foreign markets" below).

I built and syntax-checked every file, but couldn't run `npm install` or start
the live server in the sandbox I built this in (no network access there). You'll
want to run the steps below yourself before trusting it end to end.

## Setup

```bash
npm install
npm start
```

Then open `http://localhost:3000`. Sign up, and you'll get a $100,000 paper
account automatically.

Optional environment variables (create a `.env` file):

```
PORT=3000
STARTING_CASH=100000
SESSION_SECRET=some-long-random-string     # change this before deploying anywhere real
DB_PATH=./data/app.db
```

## Architecture

```
server/
  index.js            Express app entry point, wires up routes + websocket
  db.js                SQLite connection + schema (users, accounts, positions, trades, contests)
  auth.js              Password hashing (scrypt) + signed session tokens — zero extra deps
  dataProvider.js      Pluggable market data — mock now, real provider swap-in documented inline
  ws.js                WebSocket broadcast of live quote ticks every 2s
  middleware/
    requireAuth.js     Protects account-scoped routes
  routes/
    auth.js            POST /api/auth/signup, /api/auth/login
    quotes.js           GET /api/quotes, /api/quotes/symbols
    portfolio.js         GET /api/portfolio  (cash, positions, live P&L)
    trades.js            POST /api/trades (buy/sell, atomic), GET /api/trades/history
    leaderboard.js       GET /api/leaderboard (all accounts ranked by P&L)
public/
  index.html           Auth screen + main app shell
  app.js               Frontend logic: auth, websocket quotes, chart, trading, leaderboard
  styles.css           Same dark/gold design language as the marketing prototype
```

## Scaling to 10k accounts

SQLite (via `better-sqlite3`) comfortably handles millions of rows and is fast
for reads even under load — the one real constraint is write concurrency,
since SQLite serializes writes to a single file. At 10k accounts with normal
paper-trading trade volume (people don't trade every second), this is a
non-issue. `journal_mode = WAL` (already set in `db.js`) lets reads continue
while a write is happening, which is the main lever for this constraint.

If you outgrow it — very high concurrent write load, multi-region deployment,
need for read replicas — swap `db.js` for a Postgres connection (`pg` or an
ORM like Prisma/Drizzle). Every other file talks to the database through
`db.prepare(...).run()/.get()/.all()` calls with plain SQL, so the blast
radius of that migration is contained to `db.js` and the query strings, not a
rewrite of the app.

## Going live with real market data

**US equities**: Alpaca's free Paper Trading / Market Data API is purpose-built
for exactly this. Swap the body of `getQuote()`/`getQuotes()` in
`dataProvider.js` for calls to their API — the shape is documented inline in
that file. You could even use Alpaca's own paper brokerage accounts instead of
building your own ledger, which would let you delete most of `trades.js` and
`portfolio.js` — worth evaluating once you're past the prototype stage.

**Foreign markets**: this is real added scope, not a config change. Alpaca is
US-only. Each foreign exchange (LSE, TSX, ASX, XETRA, TSE, etc.) needs its own
data vendor with its own contract, pricing, and delay terms (real-time vs.
15–20 min delayed — real-time redistribution to the public typically requires
exchange licensing that gets expensive fast). Budget real evaluation time per
market before committing.

## Compliance note

Once real STONK-denominated entry fees and NFT prizes are riding on this,
you're operating a paid-entry skill contest — which is a well-trodden legal
category in the US (see prior conversation for examples), but entering
international players multiplies the jurisdictions whose contest/sweepstakes
law applies. Get this reviewed by a lawyer before opening entries beyond your
home country. I'm not a lawyer — this is a pointer, not clearance.

## The satellite ecosystem (DraftKings-style qualifying system)

**Phase 1 of a larger redesign** — the app now runs two connected layers:

**Main Event** (`server/contestScheduler.js`) — one room, Monday-Friday (ET).
Flat 15% rake off every entry (10% platform + 5% affiliate — paid to a
referrer if the entrant was referred, otherwise it rolls into platform
revenue too, so nothing vanishes and platform+affiliate always sum to
exactly 15% of gross). The remaining 85% funds as many **Activated Stonk
Brokers** as it supports via the ladder algorithm (`server/prizeLadder.js`)
— not capped at one anymore. Whatever's left over after funding all
possible Brokers goes winner-take-all to the next finishing position. Every
entrant gets ranked and recorded in `contest_results`, not just the winner.

**Satellites** (`server/satelliteScheduler.js`) — Phase 2 now ships the real
session matrix: three daily tiers plus one weekly tier, all sharing the exact
same rake + ladder algorithm as the Main Event, just funding 3,000 STONK
**Main Event tickets** instead of Brokers.

| Tier | Cadence | Window (ET) | Entry |
|---|---|---|---|
| 🔔 Full Day | Every trading day | 9:30 AM – 4:00 PM | 300 STONK |
| ☀️ Morning | Every trading day | 9:30 AM – 1:00 PM | 300 STONK |
| 🔥 Afternoon | Every trading day | 1:00 PM – 4:00 PM | 300 STONK |
| 🎟️ Weekly Qualifier | Same week as Main Event | Mon 00:00 – Fri 23:59:59 | 1,000 STONK |

Trading eligibility ends at **4:00 PM ET** (real NYSE/NASDAQ close) — no
extended-hours pricing implied, per the earlier decision. Daily tiers don't
open on weekends; the Weekly Qualifier resolves alongside the Main Event on
Friday close and reopens the next Monday, same cadence.

A ticket is a fully-funded, free seat in the Main Event — redeeming one
doesn't charge the holder again, but the entry still counts its full 3,000
STONK toward that Main Event's gross pool (see `tickets` table and
`POST /api/contests/:id/enter` with `useTicket: true`).

All four tiers were tested end-to-end for correct scheduling (a session
doesn't open before its actual start time, resolves right at its lock time,
skips weekends correctly, etc.) — see the inline test scenarios referenced
in the scheduler files.

Both were tested end-to-end against every worked example in the spec,
including the exact 300/600/900-entry Main Event numbers and the 100-trader
satellite example — see the inline math comments in each scheduler file.

### What's deferred from the full spec (honestly, not silently)

- **Real market-hours trading freeze** — the price simulator still runs
  24/7; session windows correctly gate *entry* into satellites, but don't
  yet actually restrict when trades can be placed. This needs to exist
  before session boundaries mean what they say for the trading itself.
- **Ticket marketplace** (buying/selling funded tickets) — explicitly not
  implemented until legal counsel signs off, per the spec. Data model has
  room for it (`tickets.status`) but no matching/trading logic exists.
- **Live prize-ladder animations, "Broker unlocked" moments, ticket-win
  reveal screens, auto-generated shareable social graphics** — visual
  polish beyond the current highlighted Main Event badge/glow treatment.
- **Player career profiles / badges** (Rookie → Trader → Floor Veteran →
  Market Maker → Stonk Broker) — not yet built.
- **Official StonkBrokers artwork** — the pixel-broker mascot on the site is
  original artwork in a similar visual style, not the actual copyrighted
  NFT art. Using the real artwork would need a partnership/license from the
  StonkBrokers team.

## Admin revenue dashboard — STONK vs. realized USD

`GET /api/admin/revenue` (gated by an `ADMIN_EMAILS` allowlist in `.env` —
empty by default, so this doesn't ship open) reports platform and affiliate
revenue two ways, deliberately kept separate:

- **`totalPlatformRevenueStonk`** — the price-independent "real business"
  number. Doesn't move just because the token pumped or dumped.
- **`totalRealizedUsdRevenue`** — each period's STONK take valued at *that
  period's own price snapshot* (stored per-contest at resolution time), not
  today's price. This is what the business actually realized.
- **`totalStonkValuedAtCurrentPrice`** — for comparison only: the same STONK
  total, revalued at today's price. The gap between this and the realized
  figure above is exactly how much of any apparent revenue change is just
  token price movement, not player activity — which was the whole point of
  asking for this split.

## One portfolio per contest entry (not one per account)

This is the core architectural change in this version. Every time you enter
a contest or satellite, you get a **fresh, dedicated $100,000 portfolio** —
not a shared account-wide one. Enter the Weekly Qualifier, a Morning
session, and a Full Day session all at once, and you have three completely
isolated portfolios: trading AAPL in one never touches your position or
cash in the others.

- `portfolios` table: one row per entry, holds its own `cash_balance`
- `positions` / `trades`: now scoped to `portfolio_id`, not `account_id`
- P&L is simply `portfolio.totalValue - 100000` — no more cross-contest
  "starting value" bookkeeping, since every portfolio always starts at
  exactly the same number
- `accounts.stonk_balance` is the only account-wide balance left — that's
  the real STONK currency used to pay entry fees, separate from any
  paper-trading portfolio

Verified with a dedicated isolation test: a trade executed in one portfolio
was confirmed to leave every other simultaneous portfolio for the same user
completely untouched (`cash_balance`, positions, everything).

## The satellite matrix

Four categories, each running at three price levels — 12 concurrent
satellites total:

| Category | Cadence | Low | Mid | High |
|---|---|---|---|---|
| 🔔 Full Day | Daily, 9:30 AM–4:00 PM ET | 100 STONK | 300 STONK | 750 STONK |
| ☀️ Morning | Daily, 9:30 AM–1:00 PM ET | 100 STONK | 300 STONK | 750 STONK |
| 🔥 Afternoon | Daily, 1:00 PM–4:00 PM ET | 100 STONK | 300 STONK | 750 STONK |
| 🎟️ Weekly Qualifier | Mon–Fri, same week as Main Event | 500 STONK | 1,000 STONK | 2,500 STONK |

All twelve use the identical rake + ladder algorithm as the Main Event —
see `server/satelliteScheduler.js`.

## Trading rules — sensible sizing, not gambling

Two rules enforced server-side on every BUY order (`server/routes/portfolios.js`),
explained on the in-app Rules page:

1. **$2B minimum market cap** — every tradable symbol already exceeds this
   (see `MIN_MARKET_CAP` in `server/dataProvider.js`), but the check is real
   and will reject anything added later that falls below it.
2. **Max 5% of portfolio per position, at entry only** — a BUY that would
   push a symbol's cost basis over 5% of the portfolio's current value gets
   rejected with the exact dollar room still available. Positions that grow
   past 5% purely from price appreciation are never touched — the rule only
   evaluates new purchase cost, never unrealized market value. SELL orders
   are never restricted.

Verified with a dedicated test: buying exactly at the 5% boundary succeeds,
one share over it is rejected, and appreciation-driven growth past 5% is
confirmed untouched by the rule.

## Pre-set portfolio allocations ("auto-fill")

Set up a percentage split (e.g. 5% AAPL, 3% MSFT, 2% NVDA) for a contest that
**doesn't exist yet** — the next Full Day Low session, or next week's Main
Event. The moment a matching contest/satellite actually opens, you're
auto-entered and the allocation fires immediately at the opening quote —
no need to be watching the clock. Free to trade normally after; this is
strictly the opening move, not a lock.

- `pending_allocations` table: keyed by **tier**, not a specific contest
  instance (which doesn't exist until the scheduler creates it)
- `server/allocationEngine.js`: validation (same 5%-per-symbol rule as
  manual trades, 100% total cap) and the actual fill logic
- Hooked into both schedulers' `openNewContest()`/`openNewSatellite()` —
  the instant a new instance is created, any matching pending allocations
  are checked and applied automatically
- One-time use: applies once, then moves to `applied` or `failed` (e.g. not
  enough STONK at open) — never silently retries
- If the entrant already has an unredeemed ticket, the Main Event auto-fill
  uses it instead of charging STONK, same as a manual entry would

Tested end-to-end: a pending allocation created before any satellite
existed correctly auto-entered the account and filled the exact percentage
split (verified to the cent) the instant the scheduler opened a matching
satellite — same confirmed for the Main Event, including ticket-based entry.

## Suggested next steps

1. `npm install && npm start` locally, create a couple of test accounts, confirm
   the trade flow and leaderboard update as expected.
2. Wire the contest tier/entry-fee logic from the marketing prototype into this
   backend (a `contests` and `contest_entries` table are already scaffolded in
   `db.js`, just not yet wired to routes).
3. Decide on a hosting target (Render, Railway, Fly.io, or a small VPS all work
   fine for this scale) and deploy.
4. Evaluate Alpaca for real US market data once you're ready to leave mock data.
