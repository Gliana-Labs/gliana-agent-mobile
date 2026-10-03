/**
 * Smoke-test the APP's Arena client against devnet.
 *
 * This deliberately exercises `src/arena/client.ts` — the same instruction
 * encoding, PDA derivation and wire-transaction path the phone uses — rather
 * than the Anchor test client. The program's own tests already prove the
 * program; what is unproven is the code between a tap and the chain, and the
 * only way to find an encoding bug before a device does is to send one.
 *
 *   npx tsx scripts/arena-smoke.ts
 *
 * Needs a funded devnet keypair (~/.config/solana/id.json by default) holding
 * the mock SKR from EXPO_PUBLIC_SKR_MINT. A second, throwaway keypair does the
 * voting, because the program refuses a vote for your own entry.
 */
import { readFileSync } from 'node:fs';
import {
  createKeyPairSignerFromBytes,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  getBase64EncodedWireTransaction,
  address,
} from '@solana/kit';
import {
  enterRound,
  fetchEntries,
  fetchRound,
  openRound,
  roundAddress,
  rpc,
  skrBalance,
  voteFor,
  type WireSigner,
} from '../src/arena/client';
import { CLUSTER, roundIdFor, skr, themeFor } from '../src/arena/config';

if (CLUSTER !== 'devnet') throw new Error('refusing to smoke-test against mainnet');

const KEYPAIR = process.env.KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;
const IMAGE = process.env.IMAGE ?? 'https://api.glianalabs.com/v1/media/smoke-test.png';

/**
 * A WireSigner backed by a local keypair.
 *
 * On the phone this is the wallet: it takes the unsigned wire transaction and
 * returns its own signed bytes. Here we decode, sign and re-encode — the same
 * contract, so the client cannot tell the difference.
 */
async function localSigner(path: string): Promise<WireSigner> {
  const bytes = new Uint8Array(JSON.parse(readFileSync(path, 'utf8')));
  const signer = await createKeyPairSignerFromBytes(bytes);
  return {
    address: signer.address,
    async signWireTransaction(unsignedWireB64: string) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(unsignedWireB64));
      const signed = await partiallySignTransaction([signer.keyPair], tx);
      return getBase64EncodedWireTransaction(signed);
    },
  };
}

async function main() {
  const me = await localSigner(KEYPAIR);
  const roundId = roundIdFor();
  console.log(`round ${roundId} — "${themeFor(roundId)}"`);
  console.log(`wallet ${me.address}  SKR ${skr(await skrBalance(address(me.address)))}`);

  if (!(await fetchRound(roundId))) {
    console.log('opening the round…');
    console.log('  ', await openRound(me, roundId));
    await settle();
  }

  const [round] = await roundAddress(roundId);
  const before = await fetchEntries(round);
  if (!before.some((e) => e.data.entrant === me.address)) {
    console.log('entering…');
    console.log('  ', await enterRound(me, roundId, IMAGE));
    await settle();
  }

  const entries = await fetchEntries(round);
  const mine = entries.find((e) => e.data.entrant === me.address);
  if (!mine) throw new Error('entered, but the entry did not come back from getProgramAccounts');
  console.log(`entry ${mine.address}  paid ${skr(mine.data.paidFee)} SKR  votes ${mine.data.votes}`);

  // Vote from a SECOND wallet: the program refuses a self-vote, and that is the
  // rule most likely to be broken by a client that assumes otherwise. The voter
  // is supplied, not generated — an ephemeral keypair has no devnet SOL to pay
  // the Vote PDA's rent with, so it could never have voted anyway.
  const voterPath = process.env.VOTER_KEYPAIR;
  if (voterPath) {
    const voter = await localSigner(voterPath);
    console.log(`voting from ${voter.address}…`);
    console.log('  ', await voteFor(voter, roundId, mine.address));
    await settle();
    const after = (await fetchEntries(round)).find((e) => e.address === mine.address);
    console.log(`votes now ${after?.data.votes}`);
  } else {
    console.log('set VOTER_KEYPAIR=<path> to exercise voting too (needs its own devnet SOL)');
  }

  console.log('\nOK — the app\'s own client encodes, signs and lands on devnet.');
}

/** Wait for the cluster to catch up; devnet confirms in well under a second. */
const settle = () => new Promise((r) => setTimeout(r, 2500));

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

void getTransactionEncoder; // kept for symmetry with the decoder import
