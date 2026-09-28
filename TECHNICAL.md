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
