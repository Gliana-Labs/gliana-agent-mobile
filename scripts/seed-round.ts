/**
 * Seed today's round with demo entries, each from its own wallet.
 *
 * WHY THIS EXISTS: an arena with nothing in it looks abandoned, and the demo
 * video has to show a contest, not an empty room. These are real entries — real
 * SKR fees, real transactions, visible to anyone reading the chain — made by
 * us. The deck says so.
 *
 * One wallet per entry is not a choice: the program keys an Entry PDA by
 * (round, entrant), so a second entry from the same wallet is refused. The
 * keypairs are written next to this script and reused, so a re-run tops up and
 * skips whoever is already in.
 *
 *   npx tsx scripts/seed-round.ts            # plan only
 *   npx tsx scripts/seed-round.ts --go       # fund + enter
 *
 * Funding comes from KEYPAIR (default ~/.config/solana/id.json), which must
 * hold SOL for fees and rent, and enough SKR for one entry fee each.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  address,
  createKeyPairSignerFromBytes,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
} from '@solana/kit';
import { enterRound, fetchEntries, fetchRound, roundAddress, rpc, skrBalance, type WireSigner } from '../src/arena/client';
import { CLUSTER, ENTRY_FEE, RPC_URL, SKR_MINT, roundIdFor, skr, themeFor } from '../src/arena/config';

const HERE = dirname(fileURLToPath(import.meta.url));
const VAULT = join(HERE, '.seed-wallets');
const GO = process.argv.includes('--go');
const FUNDER = process.env.KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`;

/** SOL per seed wallet: an ATA (~0.00204) plus room for a few signatures. */
const SOL_PER_WALLET = 3_000_000n;

const ENTRIES = [
  { name: 'dusk', uri: 'https://api.glianalabs.com/v1/media/37e2c22bca7a28d4d2cc1fd17cec62ba.jpg' },
  { name: 'pixel', uri: 'https://api.glianalabs.com/v1/media/09ef6997bfc9d9662d445286701f2b86.jpg' },
  { name: 'clay', uri: 'https://api.glianalabs.com/v1/media/60b4eaa0e0b38e7d9856a0fa960ad321.jpg' },
  { name: 'poster', uri: 'https://api.glianalabs.com/v1/media/37ec8d80079b92065df80bab8426248e.jpg' },
];

async function signerFromFile(path: string): Promise<WireSigner & { keyPair: CryptoKeyPair }> {
  const bytes = new Uint8Array(JSON.parse(readFileSync(path, 'utf8')));
  const kp = await createKeyPairSignerFromBytes(bytes);
  return {
    address: kp.address,
    keyPair: kp.keyPair,
    async signWireTransaction(unsignedWireB64: string) {
      const tx = getTransactionDecoder().decode(getBase64Encoder().encode(unsignedWireB64));
      return getBase64EncodedWireTransaction(await partiallySignTransaction([kp.keyPair], tx));
    },
  };
}

/**
 * Load or create this entry's wallet. Reused across runs, so a second run tops
 * up and skips whoever is already in rather than trying to enter twice.
 *
 * Created by `solana-keygen`, not by the Kit: Kit's generateKeyPairSigner
 * returns NON-EXTRACTABLE keys by design, so there is nothing to write to disk.
 * That is the right default for an app and the wrong one for a seeder that has
 * to come back tomorrow with the same wallets.
 */
async function seedWallet(name: string) {
  if (!existsSync(VAULT)) mkdirSync(VAULT, { recursive: true });
  const path = join(VAULT, `${name}.json`);
  if (!existsSync(path)) run('solana-keygen', ['new', '--no-bip39-passphrase', '--silent', '-o', path]);
  return signerFromFile(path);
}

async function main() {
  if (CLUSTER !== 'mainnet') console.log(`note: cluster is ${CLUSTER}`);
  const roundId = roundIdFor();
  const round = await fetchRound(roundId);
  if (!round) throw new Error(`round ${roundId} is not open yet`);
  const [roundAddr] = await roundAddress(roundId);
  const already = await fetchEntries(roundAddr);
  const funder = await signerFromFile(FUNDER);

  console.log(`round ${roundId} — "${themeFor(roundId)}"`);
  console.log(`funder ${funder.address}  SKR ${skr(await skrBalance(address(funder.address)))}`);
  console.log(`entries already in: ${already.length}`);

  const wallets = await Promise.all(ENTRIES.map((e) => seedWallet(e.name)));
  const missing = wallets.filter((w) => !already.some((e) => e.data.entrant === w.address));
  console.log(`to enter: ${missing.length} x ${skr(ENTRY_FEE)} SKR + ${Number(SOL_PER_WALLET) / 1e9} SOL each`);
  for (const w of wallets) console.log(`  ${w.address}`);

  if (!GO) {
    console.log('\nplan only — re-run with --go');
    return;
  }

  for (const [i, w] of wallets.entries()) {
    const entry = ENTRIES[i];
    if (!missing.includes(w)) {
      console.log(`${entry.name}: already entered`);
      continue;
    }
    const { value: lamports } = await rpc.getBalance(address(w.address)).send();
    const held = await skrBalance(address(w.address));
    fundWallet(w.address, BigInt(lamports) < SOL_PER_WALLET, held < ENTRY_FEE);
    const sig = await enterRound(w, roundId, entry.uri);
    console.log(`${entry.name}: entered — ${sig}`);
  }
}

/**
 * Top up SOL and SKR, skipping whatever the wallet already holds.
 *
 * Shelling out to the Solana CLI rather than building transfers here: the app's
 * Arena client has no transfer instructions and should not grow any — funding
 * is plumbing for a demo, not part of the game, and every byte of the client
 * ships in the APK. `solana` and `spl-token` already do this correctly,
 * including creating the recipient's token account.
 */
function fundWallet(to: string, needSol: boolean, needSkr: boolean) {
  const fee = Number(ENTRY_FEE) / 1e6;
  if (needSol) {
    run('solana', ['transfer', to, String(Number(SOL_PER_WALLET) / 1e9), '--allow-unfunded-recipient',
      '-u', RPC_URL, '-k', FUNDER, '--commitment', 'confirmed']);
  }
  if (needSkr) {
    run('spl-token', ['transfer', SKR_MINT, String(fee), to, '--fund-recipient', '--allow-unfunded-recipient',
      '-u', RPC_URL, '--fee-payer', FUNDER, '--owner', FUNDER]);
  }
}

function run(cmd: string, args: string[]) {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`${cmd} failed: ${res.stderr || res.stdout}`);
  return res.stdout.trim();
}

void main();
