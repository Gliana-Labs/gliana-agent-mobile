/**
 * Enter a round from a local keypair — for testing a medium end to end without
 * a phone wallet. The app's own path is MWA; this is the same instruction with
 * a desktop signer.
 *
 *   npx tsx scripts/enter-as.ts <keypair.json> <roundId> <mediaUrl>
 */
import { createKeyPairSignerFromBytes, address, getBase64EncodedWireTransaction,
         createTransactionMessage, pipe, setTransactionMessageFeePayer,
         setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
         signTransactionMessageWithSigners, getSignatureFromTransaction } from '@solana/kit';
import { readFileSync } from 'node:fs';
import { rpc, roundAddress, vaultAddress, entryAddress, associatedTokenAddress } from '../src/arena/client';
import { getEnterInstruction } from '../src/arena/generated';

const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SYSTEM = address('11111111111111111111111111111111');

async function main() {
  const [kp, roundArg, media] = process.argv.slice(2);
  if (!kp || !roundArg || !media) { console.error('usage: enter-as.ts <keypair.json> <roundId> <mediaUrl>'); process.exit(1); }
  const signer = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(kp, 'utf8'))));
  const roundId = BigInt(roundArg);
  const [round] = await roundAddress(roundId);
  const [vault] = await vaultAddress(round);
  const [entry] = await entryAddress(round, signer.address);
  const entrantTokens = await associatedTokenAddress(signer.address);
  console.log('entrant', signer.address);
  console.log('round  ', round);

  const ix = getEnterInstruction({
    entrant: signer, round, entry, vault, entrantTokens,
    tokenProgram: TOKEN_PROGRAM, systemProgram: SYSTEM, mediaUri: media,
  });
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(signer.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([ix as never], m),
  );
  const signed = await signTransactionMessageWithSigners({ ...msg, feePayer: signer } as never);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
  console.log('entered', getSignatureFromTransaction(signed));
}
void main();
