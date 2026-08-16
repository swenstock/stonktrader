# Stonk Broker Challenge — V45 Rebuild Status

Branch: `v45-rebuild`

This branch is the simulated-production rebuild. `main` remains untouched until the branch is explicitly approved and merged.

## Implemented and test-covered

- Locked player prices:
  - Runner 100 STONK
  - Clerk 200 = 150 contest + 50 protected freeroll reserve
  - Trader 400 = 350 + 50
  - Jr. Stonkbroker 1,050 = 1,000 + 50
- Exact 15% rake on contest portion, preserving half-STONK precision.
- Affiliate slice 5%; platform slice 10% when affiliate applies; unused affiliate slice remains platform revenue.
- Top-10% payout planner.
- Baseline ticket ladder:
  - Freeroll -> 2 Runner
  - Runner -> 2 Runner
  - Clerk -> 2 Runner
  - Trader -> 2 Clerk
  - Jr. Stonkbroker -> 2 Trader
- Main Event upgrade replaces baseline pair.
- Main Event ticket backing = 3,000 STONK; market resale price is independent.
- Main Event Reserve accounting.
- Deterministic top-down residual STONK bonuses.
- Atomic settlement executor.
- Explicit underfunded-settlement guard.
- V45 scheduler behind `PAYOUT_ENGINE_V45=true`.
- Deterministic simulated quote engine driven by Test Clock.
- Test Clock interprets bare date/time as America/New_York including DST.
- Existing portfolio/trade engine now uses the deterministic provider.
- Server-authoritative percentage quick trades.
- Standard 10% cost-basis entry rule.
- Degen Hours percentage buys use available cash and no 10% cap.
- Server trading-window enforcement.
- Typed ticket inventory: Runner / Clerk / Trader / Jr. / Main Event.
- True player-to-player order book:
  - Bids left
  - Offers right
  - Sell to Bid
  - Buy Offer
  - one ticket/order
- Exchange fee configurable, default 0 until product decision.
- Freeroll V45 reserve ledger separated from legacy prize counters.
- Degen Hours + Race protected contributions share the V45 `degen` acquisition reserve.
- Main Event funding/economics API.
- Full-field V45 leaderboard API with Find Me, money line, all entries, and P&L gap/cushion.
- Safe V45 preview frontend at `/v45/`:
  - browse mode
  - auth
  - real server funding meter
  - Trading Floor
  - My Contests
  - Ticket Exchange
  - Test Clock
  - tutorials
- Chart-first execution page at `/v45/trade.html?id=<portfolioId>`:
  - candles/line
  - Tick/1m/5m/15m/1h/1D
  - volume
  - MA/EMA
  - crosshair
  - position list
  - symbol lookup
  - Shares / Percentage quick trading
- Full-field Find Me page at `/v45/leaders.html`.
- GitHub Actions CI covers syntax, payout math, reserves, exact rake, scheduler behavior, atomic settlement, server boot, frontend shell and an end-to-end simulated user journey.

## Safety / feature flags

- `TEST_MODE=true` enables Test Clock and test-only funding/ticket tools.
- `/api/dev/*` returns 404 unless TEST_MODE is enabled.
- `PAYOUT_ENGINE_V45=true` selects the V45 satellite scheduler/resolver.
- Default remains legacy unless the flag is explicitly enabled.
- `MARKET_DATA_PROVIDER=demo` uses deterministic simulation.
- `MARKET_DATA_PROVIDER=live` intentionally fails until a licensed live provider is actually connected.

## Deliberately unresolved — do not guess

### 1. Lower-tier ticket redemption backing

When a won/purchased Clerk/Trader/Jr. ticket is redeemed for a future contest, we still need to lock how its backing is routed.

Example: a Clerk ticket has 200 STONK face/backing under the current model. Does redemption route:
- 150 into that contest + 50 into freeroll reserve, exactly like a cash entry, or
- a different liability treatment?

Do not hard-wire final redemption economics until Andrew confirms.

### 2. Freeroll capacity when reserve is smaller than top-10% liability

V45 refuses to create unfunded prizes. A 1,000-player freeroll currently implies:
- 100 prize-paying positions
- 2 Runner tickets each
- 200 Runner tickets total
- 20,000 STONK backing at 100 per Runner ticket.

Current scheduler behavior is intentionally conservative: if reserve is insufficient at settlement, the room becomes `blocked` with an explicit reason and makes no prize writes.

Before production launch, choose a player-facing capacity rule, e.g. reserve-backed entry caps / funded field sizes, promotional prefunding, or another explicit funding source. Do not silently subsidize from SBC revenue or change the advertised payout.

## Not yet production-live

- Root `/` still serves the old frontend.
- `main` has not been merged.
- No real wallet/token settlement is connected.
- No licensed live quote vendor is connected.
- No final lower-tier ticket redemption flow is live.
- No final real-money security/legal deployment review has been performed.

## Merge rule

Do not merge PR #1 until:
1. latest CI is green,
2. preview is visually reviewed,
3. the two unresolved economic rules above are explicitly decided,
4. branch deployment/Render path is confirmed.
