# CLOCK IN — submission answers

Paste-ready. Every claim is verifiable on-chain or in the repo.

---

## THE PROBLEM

Every generative AI app sells by the month, to people with accounts. That suits
someone who uses AI daily. It fits nobody who wants **one image**, and it fits
**no software agent at all** — an agent cannot fill in a signup form, hold a
subscription, or own a credit card.

On a phone the mismatch is sharper. You are three taps from a camera and eleven
from an account, so the thing people would actually pay for — point at this,
make it something else — dies in the signup.

**Who this is for.**

- **First market: agents already paying over x402.** There is a live ecosystem
  of software buyers transacting with HTTP 402 today, and it has no serious
  inference seller — what an agent can discover is mostly single tools, not 116
  frontier models across image, video, voice, music and chat. We are already in
  it rather than planning to be: **166 paid endpoints settling USDC on Solana**,
  every one of them described in a public OpenAPI document with its price, chain
  and payTo, reachable by any agent that can pay — no account to create, no key
  to issue.
- **Then: people who want one result, not a plan.** Students, sellers listing a
  product, anyone for whom a $20/month floor is more than the job is worth. The
  phone is how that user arrives, and the wallet is what lets them pay for one
  thing.

**Why this beats the existing apps.** Not model quality — we resell the same
frontier models. The difference is the *unit*: one call, priced before it runs,
paid from your own wallet, with nothing held on your behalf. A failed request
costs nothing because settlement happens after the model succeeds.

**What would prove it works.** Paid calls from wallets that are not ours, and
Arena rounds whose entries we did not seed. Today the honest number is small
and we say so on the deck's verification slide rather than claiming traction we
do not have. The measurable target is the first week where external entries
outnumber seeded ones.

---

## PROJECT TITLE
```
Gliana Agent
```

## PRIOR VC / ANGEL FUNDING?
**NO**

## BUILT IN THE LAST 3 MONTHS?
**YES** — first commit 2026-07-15.

## WON A PREVIOUS HACKATHON WITH THIS PROJECT?
```
N/A
```

## IF PORTING AN EXISTING APPLICATION OVER TO MOBILE, WHAT MAJOR FEATURES OR NEW SIGNIFICANT MOBILE DEVELOPMENT HAVE YOU DONE?

```
Not a port — see the next answer.

GlianaAI started as a pay-per-call AI inference API settled over HTTP 402
(x402 / MPP rails): one endpoint, 116 models, no accounts and no API keys,
built so that a human OR an autonomous agent could buy a single inference.
Web and mobile were always planned as clients of that API, and the Android app
is a client in its own right rather than a web app moved across.
```

## IF NO, WHAT MAJOR FEATURES OR NEW SIGNIFICANT MOBILE DEVELOPMENT HAVE YOU DONE?

```
The product is a pay-per-call inference API settled over HTTP 402 — 116 models,
no account, no API key, each call paid from the caller's own wallet. The Android
app is the client that uses the half of that API a laptop cannot reach, and
everything below was built for the phone.

SNAP: THE CAMERA IS THE PROMPT. Point the phone at something, pick a look, and
the photo comes back transformed for 4.8 cents, paid per result. A blank chat
box asks a hard question; a photograph of your desk does not. The viewfinder is
in-app — handing off to the system camera cost a cold start, someone else's UI
and a return trip — and the shot is resized to 1280px before it leaves the
phone, because that upload was most of the wait between the shutter and the
price.

THE ARENA: A DAILY CONTEST ON ITS OWN ANCHOR PROGRAM, LIVE ON MAINNET. Entry
fees, the pot and payouts are in SKR, the vault is owned by the round's PDA,
payouts are permissionless, and the holder discount is read from the entrant's
own token account on-chain. It exists only in the app and is described in full
in the SKR answer below.

THE PHOTO QUEST. Every day has a theme and the quest leads the style sheet, so
an entry is your own photograph bent toward the theme rather than a prompt
anyone could have typed. Today's is "your machine, transformed into a robot" —
the demo video is a real photo of the author's PC standing up as a mecha on the
table it was shot on.

MOBILE WALLET ADAPTER. Payments are signed in Seed Vault and settle from the
user's own wallet. One non-obvious fix made it work on device: wallets
re-serialise a transaction before signing, so the signed wire bytes must be
submitted verbatim rather than re-encoded from our own object, or the signature
verifies against the wrong message.

A GAME MAP AS THE HOME SCREEN. Four buildings — arcade, forge, photo hut,
gallery — drawn by GlianaAI itself through the same paid API the app sells.
Panning runs on the UI thread through Reanimated shared values, and travel is a
tap gesture racing the pan, because a Pressable inside a panning transform
loses every touch that drifts.

AN OFFLINE DAILY LOOP. A round is a day, its id IS the day number, and the
theme comes from a fixed list indexed by it — so the phone schedules a week of
local quest reminders with no push server, no token, and nothing for us to
hold. Rounds roll at 19:00 WIB rather than midnight UTC, because a contest that
closes at 07:00 pays out while its players are asleep.

Plus the mobile-native plumbing: camera and gallery attachments feeding
image-to-image models, generated media saved to the device gallery, wallet
session and conversations persisted so a cold start does not re-open the wallet
sheet, five synthesised arcade sounds that never interrupt the user's music, and
an adaptive launcher icon. Published on the Solana dApp Store as
com.glianalabs.agent.
```

## DOES YOUR APPLICATION HAVE AN SKR INTEGRATION? IF SO, HOW?

```
Yes. SKR is the currency of the Arena, a daily contest running inside the app on
its own Anchor program, live on mainnet:

  program  2CdzdzR1hj6w1ZjXLgvk3o2Saq5sXd1ufQ3Toww4PPHQ
  token    SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3   (real SKR, 6 dp)
  round    26NzNADwFt42BtN2rHbTmzEopDgBeJVwzRKsFwGaAkPe
  vault    BguTAwYYPj2JBRDBFqmYRLqE2RTJsEYrLb2yvyq4xRZn

ONE GLOBAL ROUND A DAY. There is no matchmaking and there are no lobbies: the
round's PDA is derived from the day number alone, so every phone that opens the
app resolves the same round, the same theme, the same pot and the same gallery.
Everyone is in one contest against everyone else, and the pot grows with the
number of players.

Entry is also PERMISSIONLESS. The app is one client; anyone who can call the
program can enter — another client, a script, an agent. One entry per wallet is
enforced by the Entry PDA being keyed on (round, entrant), and one vote per
wallet by the existence of a Vote PDA, not by anything we track.

The loop: photograph today's theme, restyle it with any of the 116 models the
app sells (paid in USDC, unchanged), then stake 5 SKR to enter that result.
Voting is free and one per wallet. When the day ends the pot pays 60% to the
winner, 25% across places 2-5, and 15% to everyone who voted for the winner.
Rounds roll at 19:00 WIB rather than midnight UTC, because a global daily round
that closes at 07:00 local pays out while its players are asleep.

Four things make it a real integration rather than a token sticker:

• The pot is held by the program. The vault is a token account owned by the
  round's PDA, so only program instructions can move it — we cannot.

• Payouts are permissionless. `claim_place` can be called by anyone once the
  round has ended, so pots still pay out if we disappear. Places claim
  individually rather than in one settle, because paying everyone at once caps
  a round at whatever fits in 1232 bytes.

• Holding SKR is enforced on-chain, not in the UI. The program reads the
  entrant's own token account and charges 100+ SKR holders 20% less — the demo
  shows the button reading "Enter · 4 SKR" and the wallet debiting 4, not 5. A
  client that lies about its balance has its transaction rejected.

• The entry fee is charged AFTER a successful generation, never before. A model
  that fails must not cost anyone SKR.

Self-votes are refused, and one-vote-per-wallet is enforced by the existence of
a Vote PDA rather than by anything we track. The program's IDL and a
security.txt are published as on-chain program metadata, so an explorer decodes
`enter`, `vote` and `claim_place` by name.

Honest scope note: generations are still paid in USDC, because verifying a
payment before a model runs happens in our gateway and this hackathon's scope is
the mobile app. We built and tested SKR-for-inference (one header swaps the
Solana rail's mint) and left it switched off: taking a volatile token for work a
provider bills us for in dollars is a business decision we did not want to make
under a deadline.
```

## DECK URL
```
(Google Drive link to gliana-agent-clockin.pdf — see below)
```
MUST be a Google Slides/Docs link or a PDF on Google Drive. The coach reported
NOT READ against `https://ai.glianalabs.com/clockin`: a self-hosted HTML deck is
not a format it accepts, so it had nothing to evaluate.

Upload `~/Desktop/gliana-agent-clockin.pdf` to Drive, then Share →
**Anyone with the link → Viewer**, and leave downloading ENABLED (they require
it). 13 pages, 4.8 MB — inside the 40-page and 20 MB limits.

The HTML original stays at `https://ai.glianalabs.com/clockin` for humans.

Technical evidence (boundaries, build steps, on-chain transaction for every
claim, measured latencies):
`https://github.com/Gliana-Labs/gliana-agent-mobile/blob/master/TECHNICAL.md`

## DEMO VIDEO URL
```
(public YouTube link — see below)
```
NOT unlisted. The coach reported NOT READ and asks for a link that "plays
without sign-in", so set visibility to **Public**. Upload
`~/Desktop/gliana-clockin-demo.mp4` (1:57, 117.3s) and attach `demo.srt` as a
caption track — the complaint was that the transcript could not be read, and
real captions remove any dependence on their speech-to-text.

## REPOSITORY URL
```
https://github.com/Gliana-Labs/gliana-agent-mobile
```

## ANDROID APK URL
```
https://github.com/Gliana-Labs/gliana-agent-mobile/releases/download/v1.1.4/app-release.apk
```
