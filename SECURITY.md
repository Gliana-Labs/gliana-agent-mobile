# Security notes

What an audit of this repository finds, and what we concluded about each. Where
we disagree with a scanner we say why, with the constraint that makes the case.

## Payouts are permissionless BY DESIGN

`ClaimPlace` (`program/arena/programs/arena/src/lib.rs`) has **no `Signer`**, and
a scanner reads that as a missing authorization check. It is the design: a round
must be able to pay out even if we disappear, so anyone can push a claim through.

What stops that being theft is where the money can land, not who sends it:

```rust
constraint = winner_tokens.owner == entry.entrant   // only into the winner's own account
require_keys_eq!(round.top[place - 1], entry.key()) // the votes decide the place, not the caller
require!(!ctx.accounts.entry.paid)                  // each place pays once
require_keys_eq!(ctx.accounts.entry.round, round.key())
require!(Clock::get()?.unix_timestamp >= round.ends_at)
```

The caller supplies a place; the leaderboard decides whether that is true. A
third party can therefore *push* a payout and cannot *redirect* one. Covered by
tests in `program/arena/tests/`.

## The entry fee is read from the chain, not the client

`enter` loads the entrant's own SKR token account and charges 100+ SKR holders
20% less (`HOLDER_THRESHOLD`, `HOLDER_FEE_BPS`). A client that lies about its
balance has its transaction rejected by the program.

## The whole pot pays out

`WINNER_BPS` 6000 + `RUNNERS_BPS` 2500 + `VOTERS_BPS` 1500 = 10000 bps. The
program takes no fee, and there is no account that could receive one.

## scripts/arena-smoke.ts does not log key material

Every `console.log` in that file prints a public address or a transaction
signature. A scan flagged it because the script used to generate 64 bytes with
`crypto.getRandomValues` for an ephemeral voter, never use them, and `void` them
to satisfy the compiler. Those bytes are gone. The remaining match is the string
`VOTER_KEYPAIR`, which is the name of an environment variable, not a key.

## Dependency advisories: patched where a patch exists

`npm audit fix` resolves by installing `expo@44.0.6` against an SDK 56 project,
which is why it was never run. **`overrides` does the job it could not**: it pins
a patched transitive version without touching the Expo SDK.

| | app lockfile | arena lockfile |
|---|---|---|
| before | 44 total, 33 high | 14 total, 6 high |
| after | 34 total, 24 high | 13 total, 3 high |

Pinned: `ws`, `@xmldom/xmldom`, `browserslist`, `shell-quote`, `postcss`,
`brace-expansion`, `@toon-format/toon` (app) and `toml` (arena). `nanoid`
cleared as a consequence. Each is a same-major patch, and the app was
**bundled** after the change — `npx expo export` produces an 8.9 MB Hermes
bundle — because a typecheck does not exercise Metro, and Metro is where these
packages live.

Three remain, and will not move:

- **`js-yaml` 5.x and `image-size` 2.x** are the only fixed releases, and both
  break the bundle: `Android Bundling failed … TypeError: The "list" argument
  must be an instance of SharedArrayBuffer`. Tried, reverted, bundle
  re-verified.
- **`bigint-buffer`** has a vulnerable range of `*` — every published version is
  affected and there is no fixed release to pin to. It arrives through
  `@solana/spl-token` in the Anchor **test harness**.

All three are build- and test-time only. None ships in the APK: Metro's
websocket, a config-plugin YAML parser and a test-harness encoder do not run on
a phone.

### The Anchor program's own lockfile### The Anchor program's own lockfile

`program/arena/package-lock.json` reports 6 high advisories: `bigint-buffer`
(buffer overflow via `toBigIntLE`) and `toml` (uncontrolled recursion), reached
through `@coral-xyz/anchor`, `@solana/spl-token` and `anchor-litesvm`.

That lockfile is the **test harness**, not the program. The on-chain program is
Rust, compiled with `cargo build-sbf`; these JavaScript packages run LiteSVM
tests on a developer's machine and are present in neither the deployed program
nor the APK. `npm audit fix` reports "up to date" — it can fix none of them —
and `--force` resolves by installing `@solana/spl-token@0.1.8`, a 2021 release
that would break the tests outright.

The correct fix is upstream: these clear when Expo and React Native bump their
own toolchain. Planned for after the submission window, with a full rebuild and
device test rather than a lockfile edit.
