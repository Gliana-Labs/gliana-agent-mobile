/**
 * Devnet fixtures: enter or vote from a throwaway keypair.
 *
 * A gallery with one entry and no votes cannot show ranks, an empty state, or
 * a winner — and those are most of the screen. This fills the round so the UI
 * can be judged against something that looks like a real day.
 *
 *   KEYPAIR=<path> tsx scripts/arena-fixture.ts enter <imageUrl>
 *   KEYPAIR=<path> tsx scripts/arena-fixture.ts vote  <entryAddress>
 */
import { readFileSync } from 'node:fs';
import {
  createKeyPairSignerFromBytes,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  type Address,
} from '@solana/kit';
import { enterRound, voteFor, type WireSigner } from '../src/arena/client';
import { CLUSTER, roundIdFor } from '../src/arena/config';

async function main() {
  if (CLUSTER !== 'devnet') throw new Error('fixtures are devnet-only');
  const [what, arg] = process.argv.slice(2);
  const path = process.env.KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
  const kp = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, 'utf8'))));
  const signer: WireSigner = {
    address: kp.address,
    async signWireTransaction(b64) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(b64));
      return getBase64EncodedWireTransaction(await partiallySignTransaction([kp.keyPair], tx));
    },
  };
  const round = roundIdFor();

  if (what === 'enter') console.log(await enterRound(signer, round, arg));
  else if (what === 'vote') console.log(await voteFor(signer, round, arg as Address));
  else throw new Error('usage: arena-fixture.ts enter <imageUrl> | vote <entryAddress>');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
