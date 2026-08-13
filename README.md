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

## Scheduled orders for already-joined portfolios

Distinct from the tier-triggered auto-fill above: once you've **already
joined** a contest, you can queue a percentage allocation to fire at the
**next real market open** (9:30am ET) instead of trading manually right
away — useful if you joined mid-day and want tomorrow's opening trades
queued in advance.

- `scheduled_orders` table, keyed to a specific existing `portfolio_id`
- `server/marketOpenScheduler.js`: ticks every 15s, fires any order whose
  `target_open_at` has passed
- **Critical correctness point**: sizing uses the portfolio's *live* value
  at execution time, not a hardcoded 100000 — a portfolio that's already
  traded and grown (or shrunk) since joining gets sized off what it's
  actually worth right now. Caught and fixed this exact bug during testing.
- Re-validates against the 10% max-position rule and available cash at
  fire-time, not just at scheduling time, since real trades may have
  happened in the meantime. Verified with a case where existing holdings
  plus the queued order would exceed 10% — correctly rejected.

## Live Contests panel

The Leaderboards tab now shows every currently **open** contest (Main
Event + any open satellite) with live entry count, STONK pooled, and the
**payout schedule at current funding** (e.g. "1 Broker funded + 31,668
STONK to next" or "8 tickets funded + 1,500 STONK to next") — computed the
same way resolution does, just live instead of final. Click through to see
that specific contest's live leaderboard.

## Ticket marketplace ⚠️

Built as explicitly requested — **but flagged again clearly, since this is
the one piece of the original spec that explicitly said to hold off until
legal review**. A live secondary market for something with real redeemable
value is meaningfully closer to a financial instrument than anything else
in this app. Get a lawyer's eyes on this specifically before it touches
real STONK.

How it works:
- List any unredeemed ticket for a STONK asking price (`ticket_listings`
  table). The ticket locks (`status = 'listed'`) the moment it's listed —
  can't be redeemed for a Main Event entry or double-listed while active.
- Buyer pays exactly the asking price. Seller receives asking price minus a
  **5% platform fee**. Ticket ownership transfers outright to the buyer,
  status flips back to `unredeemed` so they can use it immediately.
- Cancelling an active listing unlocks the ticket back to the seller.

Tested rigorously since this moves real economic value: full buy/sell flow
with exact fee math verified, ownership transfer confirmed, self-purchase
blocked, insufficient-funds purchases blocked, and confirmed a listed
ticket is correctly excluded from the Main Event redemption query (same
query `contests.js` already used — no changes needed there, it was already
correct by construction).

**Not yet built**: the fee revenue isn't wired into the admin STONK/USD
revenue dashboard — a reasonable follow-up once this is live.

## Brokerage-style trade UI refresh

An original interface, deliberately **not** copying Robinhood's specific
trademarked look — since the app isn't officially affiliated with them,
that would be a real legal exposure and could actively hurt a future
partnership conversation. Instead this uses the generic patterns shared
across virtually every modern trading app (clean price-forward layout,
minimal one-tap actions):

- **"Buying Power"** instead of "Cash" — standard brokerage terminology
- **Price flash animation** — brief green/red flash on every tick, both in
  the watchlist and the open trade modal
- **Day's high/low** shown under the chart (tracked since server start —
  a real trading day's open/close reset isn't modeled yet, noted as a
  simplification)
- **Order review → confirm → filled** flow — every trade (manual quantity
  or the % quick-buttons) now shows a review screen with estimated price
  and total before executing, then a clean "Order filled" confirmation
  after. No more instant-fire trades from a single tap.
- **Recent Activity** — full order history now visible in the trade view
  (the API already existed, it just wasn't surfaced anywhere before)
- **Allocation donut chart** — dependency-free SVG chart showing cash vs.
  each position as a % of the portfolio, doubles as a visual reminder of
  the 10% position-size rule in action
- **% of portfolio** column added to the positions table alongside dollar P&L

The actual "seamless paper-to-real" promise lives in the backend
separation, not the UI: `dataProvider.js` is the one place quotes come
from, cleanly isolated from the trading logic. If Robinhood (or anyone)
ever provides real backend access, that's a data-layer swap behind this
same interface, not a rewrite.

## Freeroll tier, multi-entry, and named price tiers

**Named tiers**: Rookie (100+50)/Trader (300+50)/Whale (750+50), plus a new
**Freeroll** level exclusive to the Weekly Qualifier — 0 STONK, no wallet
needed, capped at 1 entry per account per room.

**The +50 STONK surcharge** on every paid satellite room (all 12) funds the
freeroll pool separately from that room's own prize pool — verified this
split is real: a room's own gross pool only ever reflects the base fee
(100/300/750), never the surcharge, confirmed with a direct test. Every
time the surcharge fund crosses 3,000 STONK (~60 paid entries), one
freeroll ticket becomes available and gets awarded to whoever finishes #1
in the next freeroll room that resolves — tested end-to-end including the
fund correctly decrementing after award.

**Multi-entry**: up to 10 entries per account per contest (satellites and
the Main Event both), each with its own separate portfolio. Enforced with
a COUNT() check, not a database uniqueness constraint — tested that the
10th entry succeeds and the 11th is correctly rejected, for both satellites
and the Main Event.

**Architecture note**: tier configuration (pricing, names, surcharge, max
entries) lives in `server/tierConfig.js`, extracted specifically to avoid a
circular dependency between `satelliteScheduler.js` and `allocationEngine.js`.

## Nav, Lobby, and trade UI refresh

- Nav: centered logo, live STONKBROKER price ticker (public `/api/account/price`
  endpoint) replacing the personal balance — balance now lives in My
  Contests instead, since a trader can have several simultaneous portfolio
  balances at once (weekly + morning + full day, etc.)
- Lobby: Main Event moved above satellites; satellites restructured into a
  two-level drill-down tree (category → rooms), matching the pattern
  already used on the Leaderboards page
- Allocation modal now opens with 10 pre-built rows, each defaulting to a
  different symbol at 10% — a genuinely usable starting point instead of
  an empty single row
- Trade modal: added a 100% quick button (buy/sell), and a candlestick
  chart toggle — ticks are bucketed client-side into 5-second OHLC candles
  since there's no server-side historical OHLC source yet

## Reserve-then-configure flow, tier renaming, and two real bug fixes

**Two bugs found and fixed from real testing feedback:**
1. The Lobby was periodically auto-scrolling to the Main Event every ~5
   seconds — traced to a background poll re-rendering an open satellite
   drill-down, which re-triggered `scrollIntoView` every refresh. Fixed by
   separating "keep the data live" from "scroll to it" — only the initial
   user click scrolls now.
2. Leaderboards showed "4 of 3 rooms open" for the Weekly Qualifier —
   a hardcoded `3` left over from before it got a 4th (freeroll) level.
   Fixed to use the real room count.

**Tiers renamed**: Clerk / Trader / Jr. Stonkbroker (was Rookie/Trader/Whale).

**Weekly Qualifier reordered to the front** of every category list — it
runs concurrently with the Main Event, not sequentially like the dailies,
so it leads.

**Reserve-then-configure entry flow**: pending (not-yet-open) rooms now
have a real "Enter this room" button instead of requiring a full
allocation setup first. Clicking it reserves the spot immediately (100%
cash, zero picks) — tested end-to-end: the reservation correctly
auto-enters with zero positions and the full $100,000 untouched once the
room opens. The trader can then set up their actual portfolio anytime
before that room opens, from My Contests — reusing the same allocation
modal, now with copy that adapts to whether picks already exist.

A "You're in!" confirmation now fires on every entry — satellites, Main
Event, and reservations alike.

**Archive of Past Winners**: new section on Leaderboards, aggregating every
rank-1 real-prize winner (Broker, ticket, or STONK) across resolved
contests and satellites, most recent first.

**Hover tooltips** added throughout: category rows explain what each
session is and when it runs; individual room chips show live stats
(traders, STONK collected, projected prize) on hover.

## Multi-entry reservation bug fix + grouped My Contests view

**Found and fixed a real bug**: reserving a not-yet-open room a second time
was silently *replacing* the first reservation instead of adding a second
one — meaning multi-entry (up to 10) never actually worked for rooms you
reserve before they open, only for rooms you join after they're already
live. Root cause: `POST /api/allocations` unconditionally cancelled any
existing pending reservation for the same room before creating a new one.

Fixed by:
- `POST /api/allocations` now checks count against the tier's actual max
  and stacks a new reservation instead of replacing — tested directly:
  5 calls to reserve the same room now correctly produce 5 separate
  reservations, and the freeroll's 1-entry cap still correctly rejects a
  2nd attempt.
- Added `PUT /api/allocations/:id` so *editing* one specific existing
  reservation's picks no longer collides with *creating* a new one — these
  were sharing the same endpoint before, which is what caused the
  replace-instead-of-stack bug in the first place.
- `myEntryCount` on pending (not-yet-open) tiers is now computed for real
  from actual pending reservations, instead of being hardcoded to 0.

**My Contests now groups multiple entries into the same room** under a
collapsible row ("Full Day — Jr. Stonkbroker · 3 entries") instead of only
ever showing one. Expanding it reveals each individual entry — whether an
already-open portfolio you can trade, or a pending reservation you can
still configure — and clicking through drills into that specific
portfolio's trade view, same as before.

## Fixed: "too many accounts" when trying to configure an already-reserved entry

**Root cause found**: My Contests had two separate, duplicate displays of
the same pending reservations — the grouped "Active" tree, and a leftover
flat "Pending Auto-fill Allocations" section with its own generic "Set up
new allocation" button. That generic button always tried to *create* a new
reservation with no awareness of which room you meant to configure — so if
you'd already reserved a room 10 times and used that button to set up
picks for one of them, it correctly (but confusingly) rejected an 11th
entry instead of letting you edit one of the 10 you already had.

**Fixed** by removing the duplicate section entirely, and — more
importantly — redesigning the grouping logic itself: **unconfigured
reservations (no picks saved yet) now always stay individually visible**,
with a prominent gold "⚙️ Set up portfolio" button, so they can never get
lost in a collapsed group. Only *configured* entries (real picks saved, or
an already-open real portfolio) collapse into the click-to-expand tree when
there's more than one — since those don't need immediate attention the way
an unconfigured reservation does.

## Enter multiple at once — with freeroll always protected

The entry review modal now shows a quantity dropdown (1 up to however many
slots you have left, capped at 10) for satellite rooms and direct-pay Main
Event entries — no more clicking "Enter" ten separate times.

**Freeroll is structurally protected from ever offering this**, not just by
convention: the dropdown only renders when more than one entry is actually
possible (`maxQty > 1`), and since freeroll's `maxEntriesPerAccount` is
hard-set to 1 in `tierConfig.js`, the math can never produce a `maxQty`
above 1 for it — the dropdown simply cannot appear. This is backed by the
same server-side max check from the reservation-stacking fix, so even a
malformed or bypassed request would still be rejected at the API layer,
verified by the existing stacking test.

Quantities execute **sequentially, one at a time, never in parallel** —
firing them in parallel could let multiple requests all pass the "count <
max" check simultaneously and race past the cap. If a batch partially
succeeds before hitting the max, you're told exactly how many actually
went through.

## Fixed: editing your first entry got treated as an 11th

**Root cause**: `editPendingAllocation()` set `editingAllocationId` to mark
"I'm editing entry X," then called `openAllocationModal()` to open the UI
— but that function's very first line unconditionally resets
`editingAllocationId = null` (needed for the "open fresh, not editing
anything" case). Since the reset ran *after* the assignment, it silently
wiped out the edit context every time — so clicking "Set up portfolio" on
any existing entry always fell through to the create-new path instead,
hitting the max-10 check even on your very first entry if you'd bulk-
reserved 10 already-empty ones.

**Fixed** by simply reordering the two lines — set `editingAllocationId`
*after* calling `openAllocationModal()`, not before. One-line-order bug,
confirmed via direct code inspection of the corrected sequence.

## Fixed: modal close-button collision, missing scheduled-orders list, and copy cleanup

**Real CSS bug found**: the per-row "remove symbol" button in allocation
modals reused the exact same class as the modal's own corner close button
— which is `position:absolute` to one specific corner. Every row-remove
button was stacking directly on top of the real close button in that same
spot, so clicking "the X" to close a modal often removed a row instead,
requiring several clicks before finally hitting the real close underneath.
Fixed by giving row-remove buttons their own class with proper inline
positioning next to their row.

**Scheduled orders had no visible list** — the backend
(`/api/scheduled-orders`) always existed, but nothing in the UI ever
surfaced it, so queued orders were genuinely un-cancelable and un-viewable
after creation. Added a "Scheduled Orders" section to My Contests.

**Scheduled order modal now defaults to 10 rows**, matching the main
allocation modal, instead of starting with just one.

**Entry buttons standardized to "Enter Contest," always showing STONK and
USD together** (was a scattered mix of "Enter for," "Pay X instead," "Use
my funded ticket").

**Signup CTA clarified** — was "starts with $100,000," which reads as USD
and is easy to confuse with the *separate* $100,000 paper-trading portfolio
cash. Now shows "100,000 STONK (~$3,460)" with a live USD conversion, even
before logging in.

**Cleaned up stale mobile nav CSS** — `.welcome` and `.chip-balance` were
still being styled for mobile despite having moved out of the nav entirely
several rounds ago, and the STONK price ticker was being hidden outright on
phones even though it's now the nav's primary element. Now shrinks instead
of disappearing.

## Suggested next steps

### Note for real-money integration (not built yet, just a stated requirement)
When real wallet integration exists: **paid tiers should require a
connected wallet, the freeroll and account signup should not.** Someone
should be able to sign up with email/Google/Facebook and play the freeroll
entirely wallet-free — wallet connection only becomes necessary the moment
they want to move up to a paid tier. This is already naturally true in the
current paper-trading build (Connect Wallet has always been cosmetic, never
gating anything) — just flagging it explicitly so it doesn't get lost when
real wallet auth eventually gets built.


1. `npm install && npm start` locally, create a couple of test accounts, confirm
   the trade flow and leaderboard update as expected.
2. Wire the contest tier/entry-fee logic from the marketing prototype into this
   backend (a `contests` and `contest_entries` table are already scaffolded in
   `db.js`, just not yet wired to routes).
3. Decide on a hosting target (Render, Railway, Fly.io, or a small VPS all work
   fine for this scale) and deploy.
4. Evaluate Alpaca for real US market data once you're ready to leave mock data.
