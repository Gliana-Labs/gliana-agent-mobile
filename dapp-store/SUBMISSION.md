# Solana dApp Store — portal form values

Paste-ready values for the publisher portal. Assets referenced are in `./media/`.

| Field | Value |
|---|---|
| dApp Name | `Gliana Agent` |
| Package Name | `com.glianalabs.agent` |
| Subtitle (50) | `90+ AI models and tools — pay per result` |
| dApp Icon 512×512 | `media/icon-512.png` |
| Banner 1200×600 | `media/banner-1200x600.png` |
| Previews (4) | `media/screenshot-1.png` … `screenshot-4.png` (1080×2400) |
| Editor's Choice headline (50) | `Describe it. Approve the price. Own the result.` |
| Editor's Choice graphic 1200×1200 | `media/graphic-1200x1200.png` |
| Languages | English |
| Countries | All countries |
| App Website | `https://agent.glianalabs.com` |
| Contact Email | `contact@glianalabs.com` |
| Support Email | `contact@glianalabs.com` |
| Terms of Use | `https://glianalabs.com/terms` |
| Privacy Policy | `https://glianalabs.com/privacy` |

## Description

> Describe what you want. Gliana Agent picks the right model, quotes the exact
> price before anything runs, and you approve it with one tap — paid in USDC
> from your Solana wallet via Mobile Wallet Adapter.
>
> 90+ AI models across image, video, voice, music, animate and transcribe, plus
> utility tools: turn a web page into structured data, summarise a YouTube
> video, read a document, build social cards, check token and currency prices.
>
> No signup, no API key, no subscription, and no balance to top up — you pay per
> result, and nothing is charged if a request is rejected.

## APK

**CURRENT — v1.0.1 versionCode 3 (upload this one):**
https://expo.dev/artifacts/eas/MGk9sE5jYPEHnlml2p943ArzLcnAqJybLDRIsP-2HgQ.apk
`com.glianalabs.agent` · versionCode 3 · versionName 1.0.1 · same keystore
(Build Credentials kSvbYdoSqO — the store only accepts an update signed with
the original cert). Contains the MWA payment fix AND the tiles/model-count
change that landed after vc2 was built.

vc2 (built, never uploaded — superseded by vc3):
https://expo.dev/artifacts/eas/A67MjdoJrtGNflfYISzk9oklAbJu1S3Wz1lwaPxYyY0.apk

v1.0.0 vc1 (currently LIVE on the store, cannot settle payments):
https://expo.dev/artifacts/eas/N1xanlDLrFAbf3NEU6DnoGuYXvvg9feSPEGQ-gs27JU.apk

Rebuild: `npx eas-cli build -p android --profile dapp-store`
Keystore backup: `npx eas-cli credentials -p android` → Download credentials.

## Release upload

**dApp File:** the release APK (download from the expo.dev link above, upload the
`.apk` as-is — it is already release-signed).

**What's New (v1.0.1, versionCode 3 — upload this text):**

> Wallet payments are fixed. Transactions signed with Phantom, Solflare or Seed
> Vault now settle reliably — if payments failed for you before, this is the
> update.
>
> The agent also does more than generate now. Alongside 90+ models for image,
> video, voice and music, it can run utility tools: pull structured data out of a
> web page, summarise a YouTube video, read a document, or build a social card.
> Ask for what you want and it picks the right one.
>
> Smaller things: every model setting shows what it does and whether it's
> required, and if your connection blips while switching to your wallet, the app
> now says so plainly instead of failing silently.

**What's New (v1.0.1, versionCode 2 — built, never uploaded):**

> Wallet payments fixed — transactions signed with Phantom, Solflare, or Seed
> Vault now settle reliably. Also new: every model setting shows its
> description and whether it's required or optional, and clearer messages when
> your connection blips while switching apps.

**What's New (v1.0.0, original):**

> First release. Describe what you want — the agent picks from 70+ AI models
> (image, video, voice, music, animate, transcribe), quotes the exact price,
> and generates after a single tap-to-pay from your Solana wallet via Mobile
> Wallet Adapter. Browse the showcase for real examples. No signup, no
> subscription — pay only for what you make.

## Pre-submit checklist

- [ ] One real MWA paid generation on a physical phone with the vc3 APK
      (vc2 was the artifact proven end-to-end; vc3 is a rebuild and needs its own run)
- [ ] Keystore backed up from EAS
- [ ] Upload APK + assets, paste the values above
