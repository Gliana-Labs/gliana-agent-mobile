/**
 * Open today's round.
 *
 * Network comes from RPC_URL + SKR_MINT, so the same script opens a devnet
 * round against the mock mint and a mainnet round against real SKR.
 *
 * Rounds are a UTC day and their id is the day number, so any client can derive
 * today's address without asking anything. Someone still has to CREATE the
 * account, which is what this does — run it once a day, or let the first player
 * of the day do it from the app.
 */
import { readFileSync } from 'node:fs';
import anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';

const { AnchorProvider, Program, Wallet, BN } = anchor;

const RPC = process.env.RPC_URL ?? 'https://api.devnet.solana.com';
const MINT = new PublicKey(process.env.SKR_MINT ?? readFileSync('/tmp/devnet-skr-mint.txt', 'utf8').trim());
const FEE = BigInt(process.env.ENTRY_FEE ?? 5_000_000); // 5 SKR
/**
 * Today's theme, from the SAME list the app derives it from — a hardcoded
 * default here would open the round with a theme nobody in the app is
 * generating for, and the theme is written into the account once, at creation.
 */
const THEMES = JSON.parse(readFileSync(new URL('../../../src/arena/themes.json', import.meta.url), 'utf8'));
const todayId = Math.floor(Date.now() / 86_400_000);
const THEME = process.env.THEME ?? THEMES[todayId % THEMES.length];

const idl = JSON.parse(readFileSync(new URL('../target/idl/arena.json', import.meta.url), 'utf8'));
const secret = JSON.parse(readFileSync(process.env.KEYPAIR ?? `${process.env.HOME}/.config/solana/id.json`, 'utf8'));
const payer = Keypair.fromSecretKey(new Uint8Array(secret));

const provider = new AnchorProvider(new Connection(RPC, 'confirmed'), new Wallet(payer), {
  commitment: 'confirmed',
});
const program = new Program(idl, provider);

const roundId = BigInt(Math.floor(Date.now() / 86_400_000));
const endsAt = Number(roundId + 1n) * 86_400;
const idLe = Buffer.alloc(8);
idLe.writeBigUInt64LE(roundId);

const [round] = PublicKey.findProgramAddressSync([Buffer.from('round'), idLe], program.programId);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), round.toBuffer()], program.programId);

if (await provider.connection.getAccountInfo(round)) {
  console.log(`round ${roundId} already open: ${round.toBase58()}`);
  process.exit(0);
}

const sig = await program.methods
  .createRound(new BN(roundId.toString()), THEME, new BN(FEE.toString()), new BN(endsAt))
  .accountsPartial({ authority: payer.publicKey, round, mint: MINT, vault })
  .rpc();

console.log(`round ${roundId} open`);
console.log(`  address  ${round.toBase58()}`);
console.log(`  vault    ${vault.toBase58()}`);
console.log(`  theme    "${THEME}"  fee ${Number(FEE) / 1e6} SKR  ends ${new Date(endsAt * 1000).toISOString()}`);
console.log(`  tx       ${sig}`);
