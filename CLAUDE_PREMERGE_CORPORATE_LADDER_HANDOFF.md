# Claude Pre-Merge Review — Corporate Ladder / Badge / Ticket Consolidation

Base GitHub main commit: `0691c15d2b8ce4f45b4c3c733493835188e4caad`
Status: **PRE-MERGE REVIEW ONLY. Not merged. Not deployed.**

## What was implemented

### 1. Main Event removed from the live prize destination
- `payoutEngineV2.js` no longer upgrades paid finishers into Main Event tickets.
- New paid-contest destination is fully funded **Jr. Broker Badges**.
- Active top-level V45 enhancement scripts were swept for `Main Event|main_event|MAIN_EVENT`; active V45 player-facing enhancement files were cleaned.
- `contestScheduler.start()` is no longer called, so the legacy Main Event scheduler does not open new future Main Events. Historical code/tables/routes remain for compatibility/history.

### 2. Paid-tier prize rules
- Runner: Badge(s) first when fundable; then STONK fallback for remaining protected places.
- Clerk: Badge(s) first; then 2 Runner tickets.
- Trader: Badge(s) first; then 2 Clerk tickets.
- Jr. StonkBroker: Badge(s) first; then 2 Trader tickets.
- Paid places remain top 10%, rounded up.
- Fixed-tier residual beyond fallback liabilities becomes global Badge-pool carry, not a top-3 bonus.

### 3. Runner connected-walk accounting
Exact audit case implemented and tested:
- 39,000 STONK pre-existing global carry
- 20 Runner entries
- contest prize pool = 20 × 85 = 1,700 STONK
- rank 1 contributes only 1,000 from this contest to complete a 40,000 Badge
- rank 1 receives the Badge
- rank 2 receives remaining 700 STONK
- exact reconciliation: 1,000 Badge contribution + 700 STONK fallback = 1,700

### 4. Free Roll stays local
- Free Roll has no top-10% funding guarantee.
- No Runner tickets from Free Roll.
- V45 Free Roll reserve remains local/auditable.
- When it can cover 40,000, exactly 40,000 is spent locally and passed through canonical Badge funding/issuance.
- Remaining local prize value is STONK.
- Test: 45,500 local reserve -> 1 Badge + 5,500 STONK, zero tickets.

Implementation note for review:
- The repo already has both legacy `freeroll_fund` and the V45 mirrored actual-STONK bank `freeroll_reserve_v45`. New entry contributions are idempotently keyed by `satellite_entries.id` and update `freeroll_fund`; the existing trigger mirrors positive contributions into `freeroll_reserve_v45`, which remains the V45 settlement/spend bank. This preserves the repo's established grouped Degen reserve behavior without trying to merge Free Roll money into the global Badge pool.

### 5. Atomic Badge settlement integration
`contestJuniorFundingPool.js` now exposes transaction-safe primitives so satellite settlement can atomically:
- credit only the Badge funding actually needed from that contest,
- issue a fully backed Badge,
- preserve global carry,
- roll back all side effects on failure.

### 6. 10:1 optional ticket burn ladder
Configuration-driven, not magic-number engine logic:
- 10 Runner -> 1 Clerk
- 10 Clerk -> 1 Trader
- 10 Trader -> 1 Jr. StonkBroker ticket

Implemented with a ticket-row adapter, not by modifying the proven quantity-based prize burn engine.
- all 10 source ticket rows become `consumed`
- source ticket liability is released
- exactly one higher-tier ticket is issued with target-tier backing
- duplicate burn ID rejects
- consumed/listed tickets cannot be reused by the burn path

### 7. Critical ticket-entry gap fixed
A matching entry ticket can now actually enter its corresponding paid satellite tier:
- Runner ticket -> Runner contest
- Clerk ticket -> Clerk contest
- Trader ticket -> Trader contest
- Jr. StonkBroker ticket -> Jr. StonkBroker contest

Ticket-funded entry:
- charges the player 0 STONK
- consumes the ticket atomically
- still records the correct contest portion
- still directs the tier's 50-STONK Free Roll contribution when applicable

End-to-end test:
`10 Runner -> burn -> 1 Clerk -> Clerk contest with account balance 0 -> Clerk ticket consumed -> 150 contest portion -> 50 Free Roll funding exactly once.`

### 8. Player-facing vocabulary
- Tickets get you in.
- Badges get you promoted.
- Jr. StonkBroker Ticket = contest entry.
- Jr. Broker Badge = achievement asset.
- 20 Jr. Broker Badges -> Activated StonkBroker.
- Prize modal and live payout projection use new Badge/fallback language.
- Ticket Exchange gets optional 10:1 burn controls.

## Deterministic Badge tiebreak
Already present in `satelliteSchedulerV45.rankSatellite`:
`P&L descending`, then `entryId ascending`.
No second Badge-specific ranking system was added.

## Tests actually executed locally

`npm test` — PASS in full, including:
- payoutEngineV2
- settlement planner
- DB settlement executor
- new corporate-ladder math + promotion GUI
- new ticket burn + ticket-funded real-entry integration
- scheduler V45
- Free Roll reserve
- rake
- quotes
- clock
- orders/blotter
- full chart shell/stages 2,3,4,4-drawings,5,6,6-overlays,103-axis-lock

Additional explicit outputs:
- `Corporate Ladder Prize Consolidation math: PASS`
- `Runner carry: 39,000 carry + 1,000 contest -> Badge; 700 STONK fallback`
- `Free Roll: 45,500 local reserve -> 1 Badge + 5,500 STONK; zero tickets`
- `Ticket Burn V45: PASS`
- `10 Runner -> 1 Clerk; duplicate rejected; source rows consumed`
- `Ticket -> real paid-tier entry: PASS`
- `10 Runner -> 1 Clerk -> Clerk contest with 0 STONK charged + 50 Free Roll funding`

Legacy Stage 2/3 direct tests on the local Node 22.16 runtime have pre-existing `COUNT(*) number vs BigInt` strict-equality failures unrelated to this change; Stage 4, Broker Race, new tests, and full npm suite pass. Do not interpret those local runtime typing assertions as a settlement regression; please run the repo's normal CI/runtime when reviewing.

## What I want Claude to trace by hand
1. Runner 39K carry -> 1K current-contest contribution -> Badge -> 700 STONK.
2. Clerk/Trader/Jr fixed fallback preservation around Badge allocation.
3. Free Roll 40K local spend -> canonical Broker/Overflow split -> Badge, with cash residual remaining local.
4. Ticket burn liability: 10 source ticket liabilities released, one target ticket liability created.
5. Burned ticket -> real entry: no STONK debit, correct contest portion + 50 Free Roll contribution.
6. Negative assertion: no new `main_event_ticket` can be produced by V45 corporate-ladder settlement.
7. `contestScheduler.start()` retirement does not break unrelated routes that only import utility functions from `contestScheduler`.

## Not claimed
- This is NOT merged.
- This is NOT deployed.
- Production behavior has NOT been verified.
