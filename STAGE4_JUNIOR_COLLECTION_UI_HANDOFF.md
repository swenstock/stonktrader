# Stage 4 Junior Collection UI — Handoff

Scope is limited to Stage 4 of the finalized SBC Prize Ladder roadmap: player-facing Junior collection/progress, redemption action, and transaction history.

## What changed

- Added authenticated player snapshot service in `server/juniorBrokerStage4.js`.
- Extended existing `/api/account` route with:
  - `GET /api/account/junior-broker`
  - `POST /api/account/junior-broker/redeem`
- Added one isolated current-shell enhancement:
  - `public/v45-stage4-junior-ui.js`
  - `public/v45-stage4-junior-ui.css`
- Registered those assets in the existing production shell enhancement stack in `server/index.js`.

## Player-facing behavior

Inside the existing `My Contests` view the player gets one compact collection card showing:

- Junior Stonk Broker count
- `x / 20` progress toward the next Activated Stonk Broker
- progress bar
- Redeem button enabled only when the authenticated player has at least 20
- full redemptions currently available
- collapsible transaction history showing won Juniors, minted Juniors, and funded Broker redemptions

Player copy uses `Junior Stonk Broker` / `Junior`. It does not expose the internal identifier `junior_broker_share`.

## Real backend state, not UI simulation

The card reads the real Stage 2/3 tables. The Redeem button invokes the already-approved `redeemJuniorsForActivatedBroker(...)` path through Stage 4's service wrapper. It therefore preserves:

- exact 20-unit burn
- exact 733,332-STONK Broker Reserve debit
- Stage 3 generic burn ledger record
- reserve solvency enforcement
- `funded_pending_delivery` external-delivery boundary

The browser does not maintain a fake Junior balance in localStorage.

## Transaction history

History comes from real issuance and redemption records:

- `sbc_junior_broker_issuances`
- `sbc_activated_broker_redemptions`

STONK values exposed to JSON are serialized as exact integer sub-unit strings, never floating-point numbers.

## Visual constraint

Stage 4 does not restyle or replace the existing site. The new CSS is scoped under `#sbcJuniorCollectionV4`. No existing header, navigation, contest cards, charts, order entry, leaderboard, ticket exchange, or My Contests structures were rewritten.

The card is appended to the existing `#view-my` container and follows the current dark/compact financial visual language.

## Behavioral test coverage

`server/juniorBrokerStage4.test.js` executes real Stage 1–3 logic and Stage 4 service/UI view-model behavior:

1. Seeds 13 won Juniors + 1 minted Junior and verifies count = 14, progress = `14 / 20`, redemption disabled.
2. Verifies history returns all real issuance rows, including the minted path.
3. Adds six more funded Juniors and verifies count = 20 and redemption becomes available.
4. Executes a real redemption through the Stage 4 service and verifies:
   - status `funded_pending_delivery`
   - exact `733332000000` Broker Reserve sub-unit debit
   - player count becomes 0
   - transaction history contains the actual -20 redemption row.
5. Verifies an empty player's snapshot is 0 with no fake history.
6. Executes the actual browser JS in a VM and verifies the view-model produces 70% for 14/20, correct redemption availability at 20, and correct won/minted/redemption labels.

Stage 4 CI also reruns Stage 1, Stage 2, and Stage 3 behavioral tests unchanged.

## Explicitly not changed

- no contest prize awarding integration beyond the Stage 2 funded issuance primitive
- no direct-mint payment rail
- no on-chain NFT delivery adapter
- no future Trader/Clerk/Runner UI
- no Stage 5+ economics
- no order-entry, leaderboard, contest-rule, chart, header, or navigation changes

## Stage 3 migration note

Claude's non-blocking observation that the Stage 3 holdings-table migration could be wrapped in an explicit transaction is documented but deliberately not mixed into this UI stage. No Stage 3 backend behavior was altered here.
