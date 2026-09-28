To: hackathon@radiant.nexus
Subject: CLOCK IN — security audit fails: "could not analyse this repository" (Gliana Agent)

Hello,

The security audit on our CLOCK IN submission fails every time we run it, and
we cannot tell from the result what is wrong on our end.

Submission:  Gliana Agent
Repository:  https://github.com/Gliana-Labs/gliana-agent-mobile

We first ran it on commit 33d4663. It failed. The panel told us to push a new
commit, so we did, and ran it again on 58b8164. It failed the same way, and
repeated runs on that commit fail the same way again:

  THE AUDIT FAILED. THE AUDIT SERVICE COULD NOT ANALYSE THIS REPOSITORY.

The result also shows COVERAGE UNRECORDED, so nothing was scored.

What we can confirm on our side:

- The repository is public (no token or invitation needed) and 4.7 MB.
- 120 tracked files, no git submodules, no Git LFS objects.
- Lockfiles are committed: package-lock.json, program/arena/Cargo.lock.
- It clones and installs cleanly from a fresh checkout.

Two things about the repo that an analyser might trip on, in case they help you
reproduce it:

1. The default branch is "master", not "main".
2. It is a mixed-toolchain repo: an Expo / React Native TypeScript app at the
   root, plus an Anchor (Rust) program under program/arena.

Could you tell us what the analyser could not read, so we can fix it? If the
failure is on the service side, we would be grateful if someone could re-run it
for us — the deadline is close and we would rather not keep pushing empty
commits to a repository that is being judged.

Happy to give you anything else that would help: build logs, a fresh clone, or a
walkthrough of the repository layout.

Thank you,
Zaki — Gliana Labs
