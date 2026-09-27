# Security policy — Gliana Arena

Program `2CdzdzR1hj6w1ZjXLgvk3o2Saq5sXd1ufQ3Toww4PPHQ` on Solana mainnet-beta.

## Reporting

Email **contact@glianalabs.com** with "ARENA" in the subject, or open a private
advisory on the repository. We will acknowledge within 72 hours. Please do not
open a public issue for anything that could drain a round's vault.

## Scope

In scope: the Anchor program in this directory — `create_round`, `enter`,
`vote`, `claim_place`, the vault PDA, and the holder-discount check.

Out of scope: the mobile app's UI, the gateway API, public RPC behaviour, and
anything requiring a user to hand over their private key.

## What is at risk

Each daily round holds its entry fees in a token account owned by the round's
PDA. A round's pot is therefore the maximum at risk from a bug here, and today
that is tens of SKR rather than a treasury. There is no admin withdrawal path:
`claim_place` is permissionless and pays the addresses the program itself
recorded in its leaderboard.

## Known limitations, stated plainly

- **Not audited.** The program has 16 tests covering vault ownership, double
  payment, early claims, self-votes, one-vote-per-wallet and the holder
  discount, but no third party has reviewed it.
- **The upgrade authority is a single key.** It can replace the program. It is
  held by the maintainer and is not a multisig.
- **A round's theme is written by whoever opens it**, and clients derive the
  theme they expect from the day number — a round opened by a modified client
  could carry a different string.
