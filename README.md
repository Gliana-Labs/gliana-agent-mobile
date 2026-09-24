# Gliana Agent — Mobile

React Native (Expo) port of [agent.glianalabs.com](https://agent.glianalabs.com).
Chat with the GlianaAI agent, get a priced generation proposal, and pay for it
**from your phone's Solana wallet** — pay-per-result, no signup, no API key.

Payments use the **Solana Mobile Wallet Adapter (MWA)**: the gateway returns an
MPP `402`, the app builds the USDC transfer, your installed wallet (Phantom,
Solflare, Backpack…) signs it, and the gateway broadcasts. No key ever leaves
the wallet.

## The Arena (SKR)

A daily contest that runs on the same wallet the app already pays with. A theme
drops each UTC day; you generate something in the chat (paid in USDC, as
before), enter it for **SKR**, and everyone votes. The pot pays the winner 60%,
places 2–5 25%, and the wallets that backed the winner *early* 15%.

What is on-chain, in `program/arena` (Anchor):

- The vault is a token account owned by the round PDA, so only the program can
  move the pot — and only `claim_place` does.
- `claim_place` is **permissionless** once the round ends: pots pay out even if
  we stop running anything.
- One vote per wallet per round (the Vote PDA's existence is the constraint),
  and never for your own entry.
- **Holding 100 SKR makes entry 20% cheaper**, read from the entrant's own
  token account. A discount the client decides is not a discount.
- A place must be *earned*: the round keeps a top-five leaderboard updated on
  each vote, and a claim is checked against it.

Rounds have no operator. The round id is the UTC day number and the theme comes
from a fixed list indexed by it, so every client knows today's theme before the
account exists — which is what lets the first player of the day create it.

```bash
npm test --prefix program/arena     # 16 LiteSVM tests, no validator
npm run arena:smoke                 # drive the APP's client against devnet
npm run arena:state                 # print today's round and its entries
```

Built for Solana Mobile's CLOCK IN hackathon. Plan and status:
[docs/PLAN-SKR-ARENA.md](docs/PLAN-SKR-ARENA.md).

## Platform support

- **Android** — full support (MWA is Android-only). Requires a Solana wallet app
  installed on the device/emulator.
- **iOS / web** — the chat UI runs, but wallet payment is disabled (MWA has no
  iOS equivalent; a deep-link wallet flow is a future addition).

## Architecture

This reuses the same backend as the web app — only the wallet/payment layer
changes (wallet-standard → MWA).

| Concern | File | Notes |
|---|---|---|
| Gateway/agent HTTP | `src/lib/api.ts` | models, price, schema, agent chat — plain `fetch`, ported verbatim |
| Payment | `src/lib/pay.ts` | `mppx` + `@solana/mpp` `charge`, same MPP 402 flow as web |
| Wallet (MWA) | `src/lib/mwa.ts` | `transact`/`authorize`; wraps MWA as a `@solana/kit` `TransactionPartialSigner` |
| Crypto polyfills | `src/polyfills.ts` | getRandomValues, Buffer, Ed25519 SubtleCrypto for the Solana stack |
| UI | `App.tsx`, `src/components/*` | chat, sidebar/history, proposal card, schema fields, media render |
| Persistence | `src/lib/storage.ts` | AsyncStorage (web app used localStorage) |
| Design tokens | `src/theme.ts` | dark "ink + amber" system in plain StyleSheet (no NativeWind) |

## Setup

```bash
npm install
cp .env.example .env          # set EXPO_PUBLIC_AGENT_URL to go live (else stub replies)
```

## Run (Android dev client)

MWA is a native module, so this **cannot run in Expo Go** — you need a dev client.

```bash
# Build + install the dev client and start Metro (device or emulator must be connected)
npx expo run:android

# After the first build, just start the bundler:
npx expo start --dev-client
```

Make sure a Solana wallet app (Phantom / Solflare / Backpack) is installed on the
same device/emulator before connecting a wallet.

## Build (EAS)

```bash
npm i -g eas-cli
eas build --platform android --profile development   # dev client
eas build --platform android --profile production    # store build
```

## Env vars (Expo inlines `EXPO_PUBLIC_*`)

- `EXPO_PUBLIC_API_URL` — gateway base (default `https://api.glianalabs.com`)
- `EXPO_PUBLIC_AGENT_URL` — deployed agent worker; **unset = stub replies**
- `EXPO_PUBLIC_SOLANA_RPC` — optional custom RPC for blockhash fetch
