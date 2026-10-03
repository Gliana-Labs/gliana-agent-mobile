# Gliana Agent — technical evidence

Everything below is verifiable: on mainnet, in this repository, or over the
public API. Written for a reviewer who wants to check rather than take our word.

## What this is, and who it is for

Buying one AI image today means a signup, a subscription and a card on file.
That fits somebody who generates daily; it fits nobody who wants **one** image,
and it fits **no software agent at all** — an agent cannot fill in a signup form.

GlianaAI is a pay-per-call inference API settled over **HTTP 402**: 116 models,
no account, no API key, each call paid from the caller's own wallet. Gliana
Agent is the Android client for the half of that API a laptop cannot reach — the
camera — plus a daily on-chain contest that only exists on the phone.

## One paid call, end to end

```
  PHONE (this repo)                    SERVER (closed)            CHAIN / PROVIDER
  ─────────────────────────────────────────────────────────────────────────────────
  camera / prompt
        │
        │ 1. POST /v1/infer {model, input}      no key, no account
        ├──────────────────────────────────▶ gateway
        │                                        │ catalogue lookup, 404 unknown id
        │                                        │ price = rate x margin x units
        │                                        │ PRE-CHARGE GUARDS: required
        │                                        │ fields, one-of, dead file URLs
        │ 2. 402 + WWW-Authenticate: Payment     │
        │◀──────────────────────────────────────┘ nothing charged yet
        │
        │ 3. price card shown, user taps once
        │ 4. Mobile Wallet Adapter / Seed Vault
        ├────────────────────────────────▶ wallet app   signs USDC transfer
        │◀──────────────────────────────── signed wire tx (used VERBATIM)
        │
        │ 5. retry with payment proof
        ├──────────────────────────────────▶ gateway
        │                                        ├──▶ verify  ──────▶ facilitator
        │                                        ├──▶ RUN MODEL ───▶ provider
        │                                        ├──▶ settle  ──────▶ chain
        │                                        │    (run BEFORE settle: a model
        │                                        │     that fails costs nothing)
        │ 6. 200 {output, costMicroUsd, receipt} │
        │◀──────────────────────────────────────┘
        ▼
  result saved to gallery            ──────▶  optionally staked in the Arena
                                              (Anchor program, SKR, mainnet)
```

**On-device vs server.** The phone holds the private key and never sends it: the
wallet signs, and we submit the wallet's own bytes without re-serialising them.
Everything else — catalogue, pricing, model routing, provider credentials — is
server-side, because an API key shipped in an APK is a published API key. Image
resize to 1280px happens on-device, before upload, which is what took the
shutter-to-card path to ~6s.

**Custody.** None. Payment settles from the caller's wallet to our payTo address
in one transaction; we never hold a balance, and there is nothing to withdraw.
The Arena's pot is a token account owned by the round's PDA — only program
instructions move it, and `claim_place` is permissionless, so pots pay out even
if we disappear.

**Failure and retries.** The 402 is free and repeatable: a request rejected by
the pre-charge guards never reaches a provider. After payment, the model runs
*before* settlement, so a provider error returns 402 `settlement_failed` with no
USDC moved. Wallet authorisations that go stale are repaired rather than
surfaced as a payment failure. The blockhash is fetched fresh at signing time —
the server's challenge blockhash is already seconds old, and MWA approval adds
15-60s, which expires the transaction in the mempool.

**Pricing is a ceiling, never an estimate.** Video bills maximum duration and the
highest resolution tier when unset; LLM chat bills estimated input plus
`max_tokens`. Undercharging on a dynamic price loses real money, so the quote is
always the worst case.

## Component boundaries

| Component | Where | Source |
|---|---|---|
| Android app (Expo/React Native) | this repo | **open** |
| Arena Anchor program | `program/arena/` in this repo | **open** |
| Inference gateway (Cloudflare Worker) | `api.glianalabs.com` | closed; the **API is public** and needs no key |
| Agent worker (model routing) | `agent.glianalabs.com` | closed |

The gateway is closed-source but not a black box: every endpoint the app calls
answers unauthenticated, and the catalog, prices and schemas it serves are the
single source the app reads at runtime.

```bash
curl https://api.glianalabs.com/v1/models            # 116 models + our prices
curl https://api.glianalabs.com/v1/price?model=flux-1-kontext-pro
curl -X POST https://api.glianalabs.com/v1/infer \
  -H 'content-type: application/json' \
  -d '{"model":"flux-1-kontext-pro","prompt":"x"}'   # 402 + WWW-Authenticate: Payment
```

## Build it

```bash
# App (Android, release APK)
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
# -> android/app/build/outputs/apk/release/app-release.apk

# Program (Anchor 0.32.1)
cd program/arena && anchor build && npm test     # 16 LiteSVM tests
```

Never run a bare `cargo update` in `program/arena`: the SBF toolchain ships
rustc 1.84 and a dozen transitive crates have since moved to edition2024. The
lockfile pins them deliberately.

## The SKR Arena, on-chain

Program `2CdzdzR1hj6w1ZjXLgvk3o2Saq5sXd1ufQ3Toww4PPHQ` · token
`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` (real SKR, 6 dp) · mainnet-beta.

The program's **IDL and security.txt are published as on-chain program
metadata**, so an explorer decodes `create_round`, `enter`, `vote` and
`claim_place` by name rather than showing base64.

| What | Proof (explorer.solana.com/tx/… or /address/…) |
|---|---|
| Program deployed | `c8V3uXhsQ8g5pHB6JMByeQbACgBYBNZHWPQcaYXo76rZNDxYgkNmEMqGs7BvSmNYxFAcNe7bFioaZPA322MB3qv` |
| Round PDA created | `4ryiNxBXzADR5pqrFGgZhy17SbXc8Qe1rjKk913eEkr9hB7WhsbYNtHQ9zxzw5Q3evt658sHv1YBerF7x7Jeafev` |
| Round account (20725) | `26NzNADwFt42BtN2rHbTmzEopDgBeJVwzRKsFwGaAkPe` |
| Vault, owned by the round PDA | `BguTAwYYPj2JBRDBFqmYRLqE2RTJsEYrLb2yvyq4xRZn` |
| **SKR entry transfer** (from the phone, Seed Vault) | `36CMJB37exC2o5VmY3gnUwy1H6cgZuEX9nv32zWQSde4LXxHTdyTaXebF8QkdZo37qbHAz7TxmF4ZzuogCMwHcGU` |
| Entry PDA (one per wallet per round) | `MvCT968sKUt3ZPCPfftw2w7EANZqnkyKtDWA6mA1yww` |
| **Vote** (one per wallet, PDA existence is the rule) | `3PBuWvmL72YbK8ihWrKTxuqMuNr7SKvTvhxeh86n9LYWsLaZtExcDccoAvW4rabyDLrMqgkjdn4iUbQFRqhPikhg` |
| Vote PDA | `6AXSRC7BuMS6gzMb9EsYFhSkHLWSk5AesPiFZbwTwTJk` |
| **Permissionless payout** — pushed by a wallet that is NOT the winner | `3oeJCnCSvrE9RWwyxca1u39RHmA7HcWCr6hRcJ1AZkwCX28Jar6VDRo93k3j1NXUjDqjYCh4xw8YJjwHENPpKxJq` |
| Other entries in round 20725 | `3icJhAYN…`, `3UWXsidq…`, `yxmWBK1S…` |

**The holder discount is a chain read, not a UI rule.** `enter` loads the
entrant's own SKR token account and charges 100+ SKR holders 20% less — the
demo shows the button reading `Enter · 4 SKR` and the wallet debiting 4, not 5
(`program/arena/programs/arena/src/lib.rs`, `HOLDER_THRESHOLD` /
`HOLDER_FEE_BPS`). A client that lies about its balance has its transaction
rejected by the program.

**One global round a day.** The round PDA is derived from the day number alone,
so every client resolves the same round, theme, pot and gallery. Entry is
permissionless: anything that can call the program can enter.

### A round has a medium and a source

`src/arena/themes.json` gives every theme two properties, and the client reads
them from the round id alone — so every device shows the same contest without
asking a server.

| | Values | What changes |
|---|---|---|
| `kind` | `image` · `video` · `music` | the quest copy, what the picker offers, how an entry renders |
| `source` | `camera` · `prompt` | whether the round wants a photograph or a description |

Six camera rounds and six prompt rounds among the image themes, plus two video
and two music themes (both necessarily `prompt` — a camera does not produce a
clip or a track).

A **camera round** offers the camera and nothing else, and the picker only
accepts generations that started from a photo taken in the app
(`GenerationResult.fromCamera`, set on the conversation the camera flow
creates). A **prompt round** has no camera button and is won on the description.

This is enforced **in the app, not on chain**. `enter` takes any URI from
anyone, so a script can post whatever it likes into any round; what the client
guarantees is that it never invites it, and that the gallery renders each entry
by its actual file type rather than by the round's.

### Judging an entry

The gallery is a grid of **posters** — a still frame, a waveform, a picture —
and nothing autoplays. Tapping one opens it full screen with real playback
(native transport for video, a seek bar for audio), which is where the vote is
cast: a clip in a 180px tile and a track cut to an eight-second preview tell a
voter what is there, not whether it is any good. An entrant can share their own
entry from that screen, and only their own.

Serving this needed a gateway fix: `/v1/media` answered HTTP Range requests
with `200` and the whole body and never sent `Accept-Ranges`. ExoPlayer
range-requests an mp3 to establish its duration, so a 20-second track reported
itself as five seconds and never finished loading — audio entries were silent
while video happened to tolerate it. The endpoint now serves `206` with
`Content-Range`, `416` past the end, and `Accept-Ranges` on every response.

## The AI side

| Step | What runs | Notes |
|---|---|---|
| Restyle a photo | `black-forest-labs/flux-1-kontext-pro` | $0.048/call at our price. Chosen because it EDITS a photo rather than borrowing its palette |
| Text-to-image (map, seeds) | `krea/krea-2-medium-turbo` | $0.018/call — the cheapest sellable text-to-image |
| Music in the demo | `elevenlabs/music-v2` | the score is our own output, so the video carries no third-party licence |
| Model choice in chat | `@cf/openai/gpt-oss-20b` | reads the live catalog; `validate()` is the security boundary — an id not in the catalog never reaches a provider |

**Image preprocessing.** The viewfinder captures at full sensor resolution and
the app resizes to **1280px on the long edge** before upload (`Viewfinder.tsx`).
A 12MP JPEG is ~5MB over a mobile connection for an image the model renders far
smaller, and that upload was most of the wait between the shutter and the price.

**Settlement (HTTP 402).** `POST /v1/infer` returns **402** with a
`WWW-Authenticate: Payment` header carrying every configured rail. The app pays
the Solana one: `@solana/mpp` builds an SPL transfer, Seed Vault signs it, the
gateway verifies it on-chain and only then runs the model. Replay is prevented
by a signature store, so a credential cannot be spent twice. **We never hold a
balance** — each call settles from the caller's wallet to ours at the moment of
use.

**Measured, not estimated** (Seeker, mobile data, 2026-09-28):

- price quoted before anything runs: **$0.048**, returned by `GET /v1/price`
- shutter → priced card: **~6 s** (upload dominates; the 1280px resize is what made it that)
- approve → image on screen: **~25 s** for flux-1-kontext-pro
- SKR entry confirm: **~8 s**, network fee `0.0021 SOL`

**Error and fallback behaviour** — the interesting cases, all hit in testing:

- **Price is charged only after a successful generation.** A model that fails
  never costs an entry fee.
- **Never auto-retry a payment.** The gateway broadcasts the signed transaction,
  so a second attempt could pay twice. A 402 can mean an in-flight transaction,
  so the app confirms **by signature** and treats "already processed" as success.
- Wallet authorization is repaired, not surfaced: a stale MWA token falls back
  to a full `authorize` inside the same session.
- Out-of-SOL is reported as out-of-SOL. Voting creates a Vote PDA and the voter
  pays its rent; that used to surface as "the network refused that transaction".
- No price, no rail: if the SKR price feed is unavailable the SKR option is not
  offered at all, rather than quoting a number we are unsure of.

## Honest notes

- Three of the four entries in the demo round were seeded by us, from wallets we
  control. They are real entries with real fees. The fourth is a real photograph
  of the author's PC, shot in the app.
- The program is **not audited**. 16 LiteSVM tests cover vault ownership, double
  payment, early claims, self-votes, one-vote-per-wallet and the holder discount.
  `security.txt` says so on-chain too.
- The upgrade authority is a single key, not a multisig.
- SKR pays for **entries**, not inference. Paying for inference in SKR is built
  and tested behind `SKR_PAYMENTS=on`, and deliberately switched off: taking a
  volatile token for work a provider bills us for in dollars is a business
  decision, not a technical one.
