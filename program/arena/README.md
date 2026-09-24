# arena — the on-chain half of the Arena

A daily generation contest paid for in SKR. Generation itself is paid in USDC
through the gateway (see `src/lib/pay.ts`); this program is only the game: the
round, the pot, the votes and the payout.

```
create_round  theme, entry fee, end time; creates the SKR vault
enter         pay the fee into the vault, record the media URL   (one per wallet)
vote          free, one per wallet per round, not for your own entry
claim_place   after the round ends, pay a place out of the vault — permissionless
```

Two properties worth stating, because a backend could only promise them:

- **Nobody can take the pot.** The vault is a token account owned by the round
  PDA, so only this program moves it, and only `claim_place` does that.
- **Payout needs no operator.** `claim_place` is permissionless once the round
  has ended, so the pot pays out even if we disappear.

## Build

```bash
anchor build
anchor test          # LiteSVM tests, no validator needed
```

**The lockfile is pinned on purpose.** The SBF toolchain ships rustc 1.84, and
several transitive crates have since moved to edition2024 or raised their MSRV;
each is pinned one version back. `cargo update` without `--precise` will break
the build with "feature `edition2024` is required".
