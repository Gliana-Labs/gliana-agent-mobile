#!/usr/bin/env bash
#
# Deploy the Arena to mainnet-beta.
#
# The only interesting flag is --max-len. By default the loader reserves TWICE
# the binary's size so future upgrades have room, and program rent is charged on
# every byte of that reservation — 2.92 SOL instead of 1.46 for this program.
# We buy exactly what we need; `solana program extend` can add room later, and
# paying rent for two years of headroom we may never use is not a good trade at
# this size.
#
# Program rent is a DEPOSIT, not a fee: `solana program close` returns it.
#
# Usage:  bash scripts/deploy-mainnet.sh          (dry run — prints the plan)
#         bash scripts/deploy-mainnet.sh --go     (deploys)
set -euo pipefail

RPC="${RPC_URL:-https://api.mainnet-beta.solana.com}"
KEYPAIR="${KEYPAIR:-$HOME/.config/solana/id.json}"
SO="$(cd "$(dirname "$0")/.." && pwd)/target/deploy/arena.so"
PROGRAM_KEYPAIR="$(dirname "$SO")/arena-keypair.json"

[ -f "$SO" ] || { echo "no binary at $SO — run: anchor build"; exit 1; }
[ -f "$PROGRAM_KEYPAIR" ] || { echo "no program keypair at $PROGRAM_KEYPAIR"; exit 1; }

SIZE=$(stat -c%s "$SO")
PROGRAM_ID=$(solana address -k "$PROGRAM_KEYPAIR")
PAYER=$(solana address -k "$KEYPAIR")
BALANCE=$(solana balance -u "$RPC" -k "$KEYPAIR" | awk '{print $1}')
RENT=$(solana rent "$SIZE" -u "$RPC" | awk '/Rent-exempt minimum/ {print $3}')

echo "program    $PROGRAM_ID"
echo "binary     $SIZE bytes"
echo "payer      $PAYER"
echo "balance    $BALANCE SOL"
echo "rent       $RENT SOL  (refunded by: solana program close $PROGRAM_ID)"
echo "need       ~$(echo "$RENT + 0.1" | bc) SOL including fees"

# A deploy that runs out of SOL mid-upload leaves a funded buffer account
# stranded and needs `solana program close --buffers` to recover it. Refuse
# early instead.
if (( $(echo "$BALANCE < $RENT + 0.05" | bc -l) )); then
  echo
  echo "REFUSING: not enough SOL. Send at least $(echo "$RENT + 0.1" | bc) SOL to $PAYER"
  exit 1
fi

# The address must be unused: deploying over a live program would be an upgrade,
# which is a different (and much more consequential) operation.
if [ "$(solana account "$PROGRAM_ID" -u "$RPC" 2>/dev/null | wc -l)" -gt 1 ]; then
  echo
  echo "REFUSING: $PROGRAM_ID already exists on mainnet. This script only does first deploys."
  exit 1
fi

if [ "${1:-}" != "--go" ]; then
  echo
  echo "dry run. re-run with --go to deploy."
  exit 0
fi

solana program deploy "$SO" \
  --program-id "$PROGRAM_KEYPAIR" \
  --keypair "$KEYPAIR" \
  --url "$RPC" \
  --max-len "$SIZE"

echo
echo "deployed: https://explorer.solana.com/address/$PROGRAM_ID"
echo "next: open today's round on mainnet —"
echo "  RPC_URL=$RPC SKR_MINT=SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3 node scripts/open-round.mjs"
