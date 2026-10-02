/**
 * Push a winning Arena place through, from a desktop keypair.
 *
 *   npx tsx scripts/claim-outstanding.ts <roundId> <entryAddress> <winnerWallet> [place]
 *
 * `claim_place` is permissionless: this wallet only pays the fee. The program
 * checks the leaderboard itself, and the constraint
 * `winner_tokens.owner == entry.entrant` means the SKR can only land in the
 * winner's own account — this cannot redirect anyone's winnings.
 *
 * Written to clear a payout stranded by a Round layout change, and kept because
 * a winner who never opens the app still deserves their pot.
 */
import { createKeyPairSignerFromBytes, address, getBase64EncodedWireTransaction,
         compileTransaction, createTransactionMessage, pipe,
         setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
         appendTransactionMessageInstructions, signTransactionMessageWithSigners,
         getSignatureFromTransaction } from '@solana/kit';
import { readFileSync } from 'node:fs';
import { rpc, roundAddress, vaultAddress, associatedTokenAddress } from '../src/arena/client';
import { getClaimPlaceInstruction } from '../src/arena/generated';

const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

async function main() {
  const secret = new Uint8Array(JSON.parse(readFileSync(process.env.HOME + '/.config/solana/id.json', 'utf8')));
  const payer = await createKeyPairSignerFromBytes(secret);
  const [roundId, entry, winner, place] = [
    BigInt(process.argv[2] ?? 0), process.argv[3], process.argv[4], Number(process.argv[5] ?? 1),
  ];
  if (!roundId || !entry || !winner) {
    console.error('usage: claim-outstanding.ts <roundId> <entryAddress> <winnerWallet> [place]');
    process.exit(1);
  }
  const [round] = await roundAddress(roundId);
  const [vault] = await vaultAddress(round);
  const winnerTokens = await associatedTokenAddress(address(winner));
  console.log('payer  ', payer.address);
  console.log('round  ', round);
  console.log('vault  ', vault);
  console.log('to     ', winnerTokens);

  const ix = getClaimPlaceInstruction({
    round, entry: address(entry), vault, winnerTokens, tokenProgram: TOKEN_PROGRAM, place,
  });
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([ix as never], m),
  );
  const signed = await signTransactionMessageWithSigners({ ...msg, feePayer: payer } as never);
  const wire = getBase64EncodedWireTransaction(signed);
  const sig = getSignatureFromTransaction(signed);
  await rpc.sendTransaction(wire, { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
  console.log('sig    ', sig);
}
void main();
