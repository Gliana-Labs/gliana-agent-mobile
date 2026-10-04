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

## Verify it yourself

[![CI](https://github.com/Gliana-Labs/gliana-agent-mobile/actions/workflows/ci.yml/badge.svg)](https://github.com/Gliana-Labs/gliana-agent-mobile/actions/workflows/ci.yml)

Every push compiles the Anchor program, typechecks the app, and probes the live
paid path.

Two things CI cannot do, stated rather than implied. **The wallet flow** needs a
device, a wallet app and Seed Vault, so it is evidenced by the demo video.
**The program's 17 tests** run locally in under a second but crash a hosted
runner — litesvm 0.3.3 is a native addon that aborts the worker after three
tests on GitHub's images, with the same binary that passes locally. Run them
yourself with the two commands below; it takes about a second.

Three things can be checked without a phone, a wallet or our servers.

### 1. The Anchor program, against its own tests

LiteSVM runs the compiled program in-process — no validator, no airdrop, about a
second.

```bash
cd program/arena
npm install
npm test                 # loads the committed arena.so — no Solana toolchain needed
```

**If you change `programs/arena/src`, rebuild and recommit the binary**, or the
tests keep passing against the previous one:

```bash
cargo build-sbf
cp target/deploy/arena.so arena.so
npm test
```

The compiled program is committed because `cargo-build-sbf` emits an SBF version
that follows the toolchain, and litesvm 0.3.3 executes only a narrow range of
them — so the binary under test is the binary that is deployed, byte for byte.
CI compiles the source separately and warns when the source has moved on without
the artefact.

All 17 pass, and they are named after the rules they defend rather than the
functions they call:

```
the round
  ✓ takes the fee into a vault only the program can move
  ✓ refuses an entry once the round has ended
  ✓ refuses a second entry from the same wallet
  ✓ refuses an entrant who cannot pay the fee
voting
  ✓ counts one vote per wallet and refuses a second
  ✓ refuses a vote for your own entry
  ✓ records how early the vote was
payout
  ✓ pays the winner 60% of the pot, once, and only after the round ends
  ✓ pays a runner-up the same share whoever claims first
  ✓ refuses to pay a winner into someone else's token account
  ✓ refuses a place outside 1..5
  ✓ refuses an entry from a different round
the leaderboard decides who gets paid
  ✓ refuses a claim from an entry that won nothing
  ✓ orders the top five by votes, and a tie keeps the earlier entry ahead
SKR holders pay less
  ✓ charges 80% of the fee to a wallet holding 100 SKR or more
  ✓ charges face value just below the threshold
  ✓ cannot be claimed by a wallet that does not hold the tokens

Test Files  1 passed (1)
     Tests  17 passed (17)
```

Two of those answer the question a scanner raises about `claim_place`, which
deliberately takes no signer: *refuses to pay a winner into someone else's token
account* and *refuses a claim from an entry that won nothing*. Anyone may push a
payout; nobody may redirect one. See `SECURITY.md`.

### 2. The app's own client, against mainnet

`scripts/` drives the same client the app uses, from a terminal:

```bash
npm run arena:state      # today's round, pot, entries — read-only, no wallet
npm run arena:board      # the all-time standings the Board tab shows
npm run arena:smoke      # opens, enters and votes on devnet (needs a funded keypair)
```

`arena:state` and `arena:board` need nothing but a network connection, and are
the quickest way to confirm the round in the app is the round on chain.

### 3. The paid path, without installing anything

Every price the app shows comes from the live gateway:

```bash
curl -s https://api.glianalabs.com/v1/models | head -c 400     # the catalog the app reads
curl -s 'https://api.glianalabs.com/v1/price?model=krea-2-medium-turbo'
curl -si -X POST https://api.glianalabs.com/v1/infer \
  -H 'content-type: application/json' \
  -d '{"model":"krea-2-medium-turbo","prompt":"a paper crane"}' | head -20
```

The last one returns **402 Payment Required** with a `WWW-Authenticate: Payment`
challenge naming the amount and the rails. That challenge is the whole product:
there is no account to make and no key to issue, and the app is simply a client
that answers it from the user's wallet.

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
