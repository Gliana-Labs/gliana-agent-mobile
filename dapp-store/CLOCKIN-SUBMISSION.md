# CLOCK IN — submission answers

Paste-ready. Every claim is verifiable on-chain or in the repo.

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

The loop: photograph today's theme, restyle it with any of the 116 models the
app sells (paid in USDC, unchanged), then stake 5 SKR to enter that result.
Voting is free and one per wallet. When the day ends the pot pays 60% to the
winner, 25% across places 2-5, and 15% to everyone who voted for the winner.

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
https://ai.glianalabs.com/clockin
```

## DEMO VIDEO URL
```
(upload ~/Desktop/gliana-clockin-demo.mp4 to YouTube, unlisted is fine, then paste the link)
```

## REPOSITORY URL
```
https://github.com/Gliana-Labs/gliana-agent-mobile
```

## ANDROID APK URL
```
https://github.com/Gliana-Labs/gliana-agent-mobile/releases/download/v1.1.0/app-release.apk
```
