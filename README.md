# Gliana Agent — Mobile

React Native (Expo) port of [agent.glianalabs.com](https://agent.glianalabs.com).
Chat with the GlianaAI agent, get a priced generation proposal, and pay for it
**from your phone's Solana wallet** — pay-per-result, no signup, no API key.

Payments use the **Solana Mobile Wallet Adapter (MWA)**: the gateway returns an
MPP `402`, the app builds the USDC transfer, your installed wallet (Phantom,
Solflare, Backpack…) signs it, and the gateway broadcasts. No key ever leaves
the wallet.

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
