# Stage 3 General Burn Engine — Handoff

Scope is limited to Stage 3 of the finalized SBC Prize Ladder roadmap. No player-facing UI is changed.

## What changed

- Added one generic, data-driven tier burn engine in `server/tierBurnEngine.js`.
- Refactored the existing Stage 2 Junior → Activated Broker redemption path to call that engine instead of keeping bespoke reserve-debit / holdings-decrement code.
- Stage 1 and Stage 2 behavioral tests are rerun unchanged in Stage 3 CI.

## Generic tier config

A tier transition is now defined by data only:

- `sourceAssetType`
- `targetAssetType`
- `burnCount` (`bigint`)
- `reserveBucket`
- `reserveDebitSubunits` (`bigint`)
- `reason`

The engine always funds exactly one target unit per configured burn.

No tier names are hardcoded in the burn logic itself.

## Holdings schema migration

Stage 2 originally constrained `sbc_prize_holdings.asset_type` to exactly `junior_broker_share`.

Stage 3 widens that table in place so future tier identifiers are data-driven while preserving all existing Junior holdings. The migration test creates the old restrictive table, seeds 9 Juniors, runs the Stage 3 schema, verifies the 9 Juniors remain, and then proves a new asset identifier can be inserted.

## Stage 2 reuse

The Stage 2 redemption config is now:

- source: `junior_broker_share`
- target: `activated_stonk_broker`
- burn count: 20
- reserve bucket: `broker_reserve`
- reserve debit: 733,332 STONK exactly

Stage 2 still preserves its existing external API/error semantics:

- fewer than 20 reports `INSUFFICIENT_JUNIORS`
- a successful redemption records `funded_pending_delivery`
- duplicate redemption stays a duplicate-redemption error

But the actual burn/debit mechanics come from the Stage 3 engine.

## Transaction model

The general engine reuses the existing Stage 1/2 reserve primitive `debitReserveInTransaction(...)`.

It does not introduce another transaction architecture.

Within one `BEGIN IMMEDIATE` transaction it:

1. validates the configured ratio and available source holding,
2. atomically debits the configured reserve using the existing SQL solvency check,
3. decrements exactly the configured number of source units,
4. records one generic funded target-unit burn row,
5. commits only if every step succeeds.

A failure rolls back reserve and holdings together.

## Behavioral acceptance coverage

`server/tierBurnEngineStage3.test.js` executes the actual engine against real in-memory SQLite and verifies:

1. A configured 4 → 1 tier transition burns exactly 4 and funds exactly 1 target unit.
2. The exact configured reserve debit is used with integer sub-unit math.
3. 3 units against a required 4 are rejected with zero holdings, reserve, debit, or burn mutations.
4. A completely different 7 → 1 future tier pair works by configuration alone, without any new burn implementation.
5. The Stage 2 Junior → Broker path creates a row in the generic burn ledger, proving Stage 2 genuinely reuses Stage 3 rather than running in parallel.
6. Existing Junior holdings survive the schema widening.
7. Generic burn ledger monetary/count fields are stored as SQLite INTEGER values.

## Explicitly not implemented

- No Stage 4 UI.
- No Trader / Clerk / Runner production tier configuration yet.
- No speculative future-tier economics.
- No changes to order entry, leaderboards, contests, charts, header, navigation, or current site styling.
- No on-chain Broker delivery adapter.

## Roadmap interpretation

Stage 3 records the configured target unit as funded in the generic burn ledger. Stage 5+ can activate real future tier configurations later without writing another burn algorithm. Stage 3 intentionally does not speculate on those future tier names, ratios, or milestone economics now.
