> **AUTHORITATIVE CURRENT ECONOMICS:** Read `SBC_PRODUCT_RULES_CURRENT.md` first. This file contains historical implementation context and may include superseded Main Event-era material. Where they conflict, `SBC_PRODUCT_RULES_CURRENT.md` wins.

# SBC GUI Handoff — integrate, do not rebuild backend

## Goal
Use this package as the visual/UI direction for the next Stonk Broker Challenge build. The existing SBC session/contest infrastructure should remain the source of truth. This is a responsive presentation shell meant to be adapted to the current framework (React/Next/Vite/etc.).

## Critical architecture clarification
- A scheduled SBC **session** can contain independent tier fields: Freeroll, Runner, Clerk, Trader, Jr. StonkBroker.
- Runner competes only against Runner, Clerk against Clerk, etc.
- The tier selector is a **view/filter**, not a change to contest architecture.
- Clicking Runner should show Runner fields for current/upcoming scheduled sessions; likewise for other tiers.

## Main Event rules represented in the UI
- SBC does **not** sell Main Event entry directly.
- Main Event access is obtained by:
  1. earning a ticket through competition, or
  2. buying an existing ticket from another player on the Ticket Exchange.
- Ticket resale price is market-set. UI should display real exchange quote data (ask / bid / last / volume) without claiming a guaranteed value.
- Main Event progress meter must use real secured/allocated prize funding state, never fake marketing progress.

## Payout architecture to preserve
- Entry funds lock/allocate at the contest start according to SBC economics.
- Proposed accounting target: 15% stated rake; 85% player prize economics.
- Top ~10% paid philosophy.
- Reserve the baseline top-10% reward first, then use remaining pool to upgrade highest finishers to Main Event tickets.
- Current design concept for non-ME top-10% prizes: 2 lower-tier transferable tickets; Runner gets 2 Runner tickets.
- No unfunded ticket/prize issuance.
- Payout engine must reconcile exactly and be deterministic.

## Ticket objects
Tickets should be first-class database assets. Suggested fields:
- ticket_id
- ticket_type
- tier
- owner_user_id / owner_wallet
- source_type (qualifier, freeroll, purchase, future NFT redemption)
- source_event_id
- created_at
- status (available, listed, reserved, consumed, expired)
- reference_entry_tier/value if needed for accounting
- listing_price_stonk
- reserved_main_event_id
- consumed_at

Maintain immutable ticket event history: CREATED, WON, LISTED, DELISTED, SOLD, TRANSFERRED, RESERVED, CONSUMED.

## Components to create from this shell
1. `TopNav`
2. `HeroPanel`
3. `MainEventPrizeCard`
4. `MainEventProgress`
5. `LiveTicketQuote`
6. `TierSelector`
7. `TierLobbyCard`
8. `HowItWorks`
9. `RuleGrid`
10. `TicketWallet`
11. `TicketExchange`
12. `MobileBottomNav`

## Data bindings
Replace all demo numbers in `index.html` with live state:
- wallet STONK balance
- Main Event secured/funding %
- Main Event prize metadata / NFT image
- real Ticket Exchange bid/ask/last/24h volume
- entrant counts per tier/session
- entry fees per tier
- current calculated payout preview

## NFT art
The emoji avatars in this package are placeholders. Replace them with actual StonkBroker NFT art/assets already authorized for the project. Preserve the pixel-art presentation and tier-specific characters.

## Responsive behavior
Desktop: two-column hero + horizontal tier cards.
Mobile: stack hero and Main Event prize; tier cards horizontally scroll; retain large self-explanatory CTAs; bottom nav fixed.

## Visual direction
Think online poker tournament lobby + DFS/sportsbook familiarity + StonkBroker pixel art. Avoid looking like a DEX. The user should instantly understand:
- Compete
- Win tickets
- Play / hold / sell tickets
- Main Event has no direct buy-in
- Prize progress

## Most important UX copy
- `CAN'T AFFORD THE TICKET? THEN WIN IT.`
- `ENTER THE TRADING FLOOR`
- `ENTER THE TICKET EXCHANGE`
- `NO DIRECT BUY-IN`
- `WIN A TICKET` / `BUY A TICKET FROM ANOTHER PLAYER`
- `PLAY • HOLD • SELL`

## Integration priority
Do not spend time recreating backend services that already work. First skin the current functionality with this component system, then wire the new payout/ticket-market logic where required.
