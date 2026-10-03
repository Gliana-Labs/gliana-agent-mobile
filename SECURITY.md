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

## Dependency advisories: 33 high, 32 of them transitive

`npm audit` reports 44 advisories. The roots are `ws`, `nanoid`, `js-yaml` and
`@xmldom/xmldom`, reached through the Expo and Metro toolchain:

| Root | Reached through | Ships in the APK? |
|---|---|---|
| `ws` (DoS) | Metro dev server | no |
| `js-yaml` (quadratic CPU) | config tooling | no |
| `@xmldom/xmldom` (XML injection) | Expo config plugins, manifest edits | no |
| `nanoid` (infinite loop on negative size) | build tooling | no |

These are build-time dependencies. A denial of service in Metro's websocket
affects a developer's machine during `expo start`, not a phone running the
release build.

**We have not run `npm audit fix`, and `--force` must not be run.** It resolves
by installing `expo@44.0.6` against an SDK 56 project — a twelve-major-version
downgrade that would break the application outright. The non-forced fix still
rewrites 148 packages, which is not a change to make between building a release
APK and submitting it.

The correct fix is upstream: these clear when Expo and React Native bump their
own toolchain. Planned for after the submission window, with a full rebuild and
device test rather than a lockfile edit.
