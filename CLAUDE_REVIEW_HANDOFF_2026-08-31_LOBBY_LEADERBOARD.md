# Claude review handoff — Lobby + Leaderboard icons + JR. BROKER

## Build intent
This build is a focused visual/UI install using the already-approved assets and the existing V45 runtime. No new architecture, route system, or replacement shell.

## What changed
1. Leaderboard contest popup now shows the selected tier portrait/icon in its header using the canonical `TIER_DATA[key].art` source.
2. Junior display label in the leaderboard popup is `JR. BROKER`.
3. The approved lobby hero reference is installed as the visible lobby hero.
4. Trading Floor junior heading is normalized to `JR. BROKER`.
5. Full-ladder support copy now says `Jr. Broker`.
6. Server cache-busters/wiring updated for the new lobby and leaderboard assets.

## Changed files
- `public/approved-lobby-hero-reference.png`
- `public/v45-leaderboard-v30.js`
- `public/v45-leaderboard-v30.css`
- `public/v45-lobby-install-v1.js`
- `public/v45-lobby-install-v1.css`
- `server/index.js`
- `server/leaderboardPopupTierIconV1.test.js`
- `server/lobbyInstallV1.test.js`

## Validation completed before deploy
- `node -c public/v45-leaderboard-v30.js`
- `node -c public/v45-lobby-install-v1.js`
- `node -c server/index.js`
- `node server/turtleTierArtStep1.test.js`
- `node server/exchangeArtworkMappingV1.test.js`
- `node server/leaderboardPopupTierIconV1.test.js`
- `node server/lobbyInstallV1.test.js`

All passed locally.

## Binary verification
`public/approved-lobby-hero-reference.png` Git blob SHA after manual upload:
`7cc5c22c563f75befb74f3cffabf4a1a821ebfef`

## Post-deploy review checklist
- Lobby opens with the approved hero image.
- Leaderboard main tier grid remains as in the accepted screenshot.
- Opening Free Roll / Runner / Clerk / Trader / Junior leaderboard popup shows the corresponding canonical tier portrait in the modal header.
- Junior is visibly labeled `JR. BROKER`, not `JR. STONKBROKER`, on the Trading Floor card and leaderboard popup title.
- Existing real leaderboard rows, Find Me, money-line controls, and contest selection remain functional.
- No regression to the five canonical turtle assets.
