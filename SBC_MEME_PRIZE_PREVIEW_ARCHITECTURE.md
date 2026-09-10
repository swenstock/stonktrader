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
