# SBC Meme Prize Preview V2 — Architecture

This preview branch reuses proven engines where useful and gives the new product a clean ownership boundary.

## Product path

User -> Tier Selection -> Contest/Session Selection -> Prize Selection -> USD Entry -> SBC Conversion Quote -> Entry -> Dedicated $100K Paper Portfolio -> Quotes/Chart/OE -> Leaderboard -> Prize Settlement.

The selection flow is intentionally sequential rather than flattened onto one dashboard.

Tickets, badge promotion, ticket exchange, badge exchange and Activated StonkBroker prize funding are not dependencies of the new shell.

## Central configuration

`config/product-catalog-v2.json` is the source of truth for tier display names/prices/art, sessions, prize assets, payout depth, tie policy, UI flags, quote defaults, wallet-provider capabilities and future provider contracts.

Initial tier prices are Runner $1, Clerk $5, Trader $15, Broker $50. Weekly Freeroll is $0.

Initial prize assets are AI, BONER and INCEL. Prize identity is referenced by stable `id`; display name/symbol/art/provider metadata can change without rewriting contest records.

Current preview payout-depth defaults are Runner/Freeroll 30%, Clerk 25%, Trader 20%, Broker 20%. These are configuration values, not settlement code yet.

Tie-policy config uses ending portfolio value, lower max drawdown and higher realized P&L. If an exact tie remains, affected rank prizes are combined and split equally. Undividable token remainder carries to the prize reserve. This is a policy declaration only until the settlement engine is implemented.

## Skill-predominant contest framing

SBC is being designed as a skill-predominant paper-trading contest. That position must be demonstrably reflected in the product mechanics rather than treated as a marketing claim.

- The payout medium is not the legal theory. Paying entry in USD/SBC or prizes in AI, BONER, INCEL or another token does not by itself establish legality. Product design must not suggest otherwise.
- Chance elements must stay out of the money path. Every entrant in a contest must begin with the same $100K paper portfolio, have access to the same permitted instruments and use the same authoritative market-data stream. Do not introduce random seeding, lottery-style awards, loot-box prize reveals, mystery payouts or random bonus draws into entry, ranking or payout without explicit legal/product review first.
- Ranking must be driven by trading results under identical contest conditions. Current policy inputs are ending portfolio value, lower maximum drawdown and higher realized P&L, with deterministic tie resolution. Rake is a separately disclosed fee and must not alter who ranks above whom.
- Live leaderboard and settlement must consume one authoritative ranking function so the skill result shown to players is the same result used to settle prizes.
- Before paid tiers go live, the paid-entry / crypto-prize structure must be reviewed by qualified gaming/gambling counsel on a state-by-state basis, including any separate money-transmission or securities-law issues created by token payments, token prizes or future tokenized-equity settlement. Architecture and code review are not substitutes for that legal review.

## Provider boundaries

Market data retains the existing simulated/live provider split. The preview reuses `/api/quotes` and `/api/quotes/bars` so the quote window and chart already sit behind the proven provider boundary.

Future payment, wallet and settlement integrations must be adapters. Contest logic must not hold private keys or vendor-specific wallet logic.

## Active symbol ownership

One UI state owns `activeSymbol`. Quote-row clicks, basket-row clicks, chart title and order-entry symbol all route through the single `selectSymbol()` function. New quote surfaces should call that path rather than reparenting or mutating unrelated widgets.

## Responsive ownership

Desktop and mobile use the same state, catalog and services. CSS changes composition only. There is no separate mobile business-logic renderer.

## Visual ownership

Dark mode is the default and light mode is a first-class alternate theme. Tier selection uses large illustrated cards and contest selection uses rich session cards. Prize selection is a dedicated screen. Turtle artwork appears at the main decision points rather than only as a lobby decoration.

## Preview server

For the separate Render preview service use:

`node server/previewServer.js`

The service root serves the preview shell and does not redirect to the production custom domain. Production `main` is not changed by this branch.

## Explicitly simulated in V2

Wallet connection, SBC payment conversion/locking, contest entry, prize funding and prize settlement are modeled as future adapter boundaries but are not real custody or settlement in this preview. Prize quantities, approximate values and player counts are visual-preview data only. The quote window and chart use the repository's real simulated market-data provider paths.
