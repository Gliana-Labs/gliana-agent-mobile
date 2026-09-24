# Arena — the CLOCK IN build plan

Solana Mobile's CLOCK IN hackathon closes **8 October 2026**. Scoring is
AI 20 · **SKR 20** · UX 15 · UI 15 · Innovation 15 · Ecosystem 15, plus a
separate $10,000 prize for "creative and meaningful SKR integration".

This app already owns the AI half: 100+ models behind one paid call, settled
from the user's own wallet over MWA. What it has no answer for is **why you open
it tomorrow**. The Arena is that answer, and SKR is what it runs on.

## Scope

**This repo only.** The gateway is not being changed for the hackathon, which
rules one thing out and is worth stating plainly:

> Paying for a *generation* in SKR is impossible without a server. Something has
> to verify the transfer before a model runs, and that something is the gateway.
> Generations keep using the existing USDC/MPP flow (`src/lib/pay.ts`), which is
> already verified working on mainnet.

So SKR is the **game** currency, not the fuel: entry fees, the pot, payouts and
holder perks. All of it lives in one small Anchor program plus this app. If the
gateway ever opens up, "pay per call in SKR" is about a day's work on top and is
the stronger story — but it is not on the critical path.

## The loop

1. A theme drops each day ("cursed street food", "Bandar Lampung in 2090").
2. You generate with any model. **Paid in USDC, as today.** Nothing changes here.
3. You like the result → **enter it**: one SKR transfer into the round's vault.
   The fee is charged AFTER a successful generation, so a model that fails never
   costs an entry fee. (Charge-then-fail is the failure mode the gateway is
   designed around; the same rule applies here.)
4. Everyone votes on the gallery. Voting is free and one vote per wallet per
   round — a vote is a signature, not a payment, so the round cannot be bought.
5. At the round's end anyone can `settle`: 60% to the winner, 25% split across
   places 2–5, 15% split across the wallets that voted for the winner **before**
   it was in front. Early taste is rewarded, not volume.

Streaks and a leaderboard sit on top: enter on consecutive days and your streak
multiplier raises your share of the voter pot, which gives a reason to come back
that is not "spend more".

## Why SKR, concretely

| Prize wording | What we do |
|---|---|
| in-app purchases | Entry fee, paid in SKR |
| rewards | The pot pays winners and early voters in SKR |
| access | Holding SKR unlocks a free daily entry, a discounted fee and a gallery badge |
| staking | Deferred — real staking needs its own program and 13 days does not allow it |

Holder perks are read **on-chain** from the wallet's SKR balance at session
start, never from anything the client claims. A client-side claim is not a perk,
it is a free entry for anyone who reads our source.

## On-chain design

One Anchor program, `arena`. Accounts:

```
Round   PDA ["round", round_id]       theme, entry_fee, ends_at, vault, entry_count, settled
Entry   PDA ["entry", round, wallet]  media_uri (R2 URL), created_at, votes
Vote    PDA ["vote", round, wallet]   entry, slot   ← existence = one vote per wallet per round
Vault   token account owned by Round PDA, holding SKR
```

Instructions: `create_round`, `enter`, `vote`, `settle`. `settle` is
permissionless after `ends_at` — if we vanish, the pot still pays out. **We never
hold entrants' SKR**, which is the same non-custodial rule the gateway follows on
every rail.

Client side, instructions are encoded **by hand** with `@solana/kit` (8-byte
Anchor discriminator + borsh args, ~150 lines). `@coral-xyz/anchor` pulls in
web3.js and a lot of bundle for what amounts to four instruction encoders, and
bundle size on a phone is startup time.

## Screens

| Screen | Contents |
|---|---|
| **Today** | Theme, countdown, pot size, your entry (or the composer), streak |
| **Gallery** | Entries as a feed, vote button, live vote counts, winner badge |
| **Profile** | Wallet, SKR balance + perks, streak, wins, past entries |

Chat stays the home screen. The Arena is a tab, not a replacement — the app is
still "any model, one prompt", and the Arena is what makes it a daily habit.

## Money-safety

Same rules as the gateway, for the same reasons:

- **Entry fee is set per round and must exceed nothing** — the user has already
  paid for their own generation in USDC, so the fee is pure game currency. There
  is no path where a popular round costs us provider spend.
- **The fee is taken after the generation succeeds.** Never before.
- **No custody.** The vault is a PDA-owned token account; settle is
  permissionless.
- **Perks read the chain**, never a client claim.
- Devnet uses a mock SKR mint (SKR is mainnet-only), selected by env, so a demo
  never needs real tokens.

## Status

| Piece | State |
|---|---|
| Anchor program | **built, 16 tests green, deployed to devnet** `2Cdzdz…4PPHQ` |
| Kit client (Codama-generated) | **done**, `src/arena/generated` |
| App client (reads, enter/vote/claim over MWA) | **done**, `src/arena/client.ts` |
| SKR holder discount | **done** — on-chain, 20% off at 100 SKR |
| Devnet fixtures | mock SKR mint `8799cf…GbRD`, round 20720 open |
| Screens (Today / Gallery / Profile) | next |
| Streaks, leaderboard | after screens |
| Compressed-NFT prize | first thing cut if late |

## Timeline (13 days)

| Days | Work | Cut line if late |
|---|---|---|
| 1–2 | Anchor program + tests (LiteSVM), devnet deploy | — |
| 3–4 | Client instruction encoders, wallet balance read, perks | — |
| 5–7 | Today + Gallery screens, voting, countdown | Gallery read-only |
| 8–9 | Profile, streaks, leaderboard | Streaks only |
| 10 | Winner's entry minted as a compressed NFT | **Cut first** |
| 11–12 | Polish, empty states, error paths, mainnet config | — |
| 13 | APK, repo, demo video, deck | — |

Each row ships something demoable on its own, so a slip costs a feature and not
the submission.

## Risks

- **A new program plus new screens in 13 days is real work.** The fallback is a
  single-player Arena: daily theme, streaks, gallery, no pot and no program. It
  still scores AI + SKR (perks) + UX, and it is a day's work, not six.
- **Public RPC rate limits** will bite the gallery. Entries are read through one
  `getProgramAccounts` call, cached, not one call per card.
- **MWA signs one transaction per session prompt.** Entering is one signature;
  voting is one signature. Never batch a user into two prompts for one action.
- Winners must publish to the dApp Store to claim — we are already listed, so
  this is a version bump, not a new submission.
