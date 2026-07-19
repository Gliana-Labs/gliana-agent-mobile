# Solana dApp Store — portal form values

Paste-ready values for the publisher portal. Assets referenced are in `./media/`.

| Field | Value |
|---|---|
| dApp Name | `Gliana Agent` |
| Package Name | `com.glianalabs.agent` |
| Subtitle (50) | `AI images, video, voice & music — pay per result` |
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

> Gliana Agent picks the right AI model for what you describe, quotes the exact
> price, and you approve it with one tap — paid in USDC from your Solana wallet
> via Mobile Wallet Adapter. 70+ models across image, video, voice, music,
> animate and transcribe. No signup, no API key, no subscription — you only pay
> for what you generate.

## APK

Release-signed universal APK (EAS-managed keystore, verified non-debug):
https://expo.dev/artifacts/eas/N1xanlDLrFAbf3NEU6DnoGuYXvvg9feSPEGQ-gs27JU.apk
`com.glianalabs.agent` · versionCode 1 · versionName 1.0.0 · minSdk 24

Rebuild: `npx eas-cli build -p android --profile dapp-store`
Keystore backup: `npx eas-cli credentials -p android` → Download credentials.

## Release upload

**dApp File:** the release APK (download from the expo.dev link above, upload the
`.apk` as-is — it is already release-signed).

**What's New (v1.0.1, versionCode 2):**

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

- [ ] One real MWA paid generation on a physical phone with this exact APK
- [ ] Keystore backed up from EAS
- [ ] Upload APK + assets, paste the values above
