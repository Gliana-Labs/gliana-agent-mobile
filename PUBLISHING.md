# Publishing to the Solana dApp Store

Gliana Agent ships via the **Solana dApp Store** (Seeker / Saga), **not** Google
Play. No EAS, no Play Console, no Play Integrity (that's Google-Play-only and would
fail here). You need: a **signed release APK** + the **dApp Store CLI** + a little
SOL for the on-chain publishing NFTs.

## 0. One-time prerequisites
- A funded **Solana mainnet** keypair (the publisher wallet) — needs ~0.1 SOL for
  the publisher/app/release NFT mints.
- `npm i -g @solana-mobile/dapp-store-cli` (v1.x).

## 1. Generate a release keystore (ONCE — keep it safe, never commit)
```bash
keytool -genkeypair -v -keystore gliana-agent-release.keystore \
  -alias gliana-agent -keyalg RSA -keysize 2048 -validity 10000
```
Store the keystore file + passwords somewhere safe (a lost key = can't update the
app). It is gitignored (`*.keystore`, `*.jks`).

## 2. Build a signed release APK
The dApp Store wants a **universal signed release APK** (not an AAB).
```bash
# Regenerate native project (keeps the icon/splash/permissions config)
npx expo prebuild --platform android

# Point gradle at the keystore (or add these to android/gradle.properties)
export GLIANA_UPLOAD_STORE_FILE=../../gliana-agent-release.keystore
export GLIANA_UPLOAD_KEY_ALIAS=gliana-agent
export GLIANA_UPLOAD_STORE_PASSWORD=********
export GLIANA_UPLOAD_KEY_PASSWORD=********

# Wire the release signingConfig in android/app/build.gradle (see note below),
# then:
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```
> DONE: the release `signingConfig` is wired in the committed
> `android/app/build.gradle` — it reads the four `GLIANA_UPLOAD_*` env vars and
> falls back to the debug keystore when unset (local smoke builds). Just export
> the env vars and run `./gradlew assembleRelease`. If you ever re-run
> `npx expo prebuild --clean`, re-apply that block (plain prebuild keeps it).

## 3. Publish with the dApp Store CLI
```bash
# Scaffold (already done: dapp-store/config.yaml). Fill in screenshots + copy.
npx dapp-store init                      # if starting fresh
npx dapp-store create publisher -k <publisher-keypair.json> -u <rpc>
npx dapp-store create app       -k <publisher-keypair.json> -u <rpc>
npx dapp-store create release   -k <publisher-keypair.json> -u <rpc> \
  --build-tools-path $ANDROID_HOME/build-tools/35.0.0
npx dapp-store publish submit   -k <publisher-keypair.json> -u <rpc> \
  --requestor-is-authorized --complies-with-solana-dapp-store-policies
```
Each `create` mints an on-chain NFT (publisher → app → release). `submit` sends it
for Solana's review.

## Assets needed for the listing
- App icon (have it: `assets/icon.png`, 512px).
- Screenshots (phone, at least 4) — capture from the Seeker.
- Short + long description, category (AI / Tools), contact + privacy URLs.

## What we deliberately skip
- **EAS** — optional; local gradle build is enough.
- **Play Integrity / App Check** — Google-Play-only; abuse is handled by the
  agent worker's per-IP rate limit (already live).
