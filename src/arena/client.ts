/**
 * Arena client — reads rounds and entries, and sends the three instructions a
 * player ever signs (`enter`, `vote`, and `claimPlace` when they win).
 *
 * Signing goes through MWA the same way payments do: hand the wallet the
 * unsigned wire transaction and submit ITS signed bytes verbatim. Wallets
 * re-serialize a transaction before signing, so a signature lifted out of their
 * response does not verify over our bytes — that is the bug that broke paid
 * generation on mobile (see lib/mwa.ts `signWireTransaction`). Same trap here.
 */
import {
  address,
  appendTransactionMessageInstructions,
  createNoopSigner,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase58Decoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base58EncodedBytes,
  type Instruction,
} from '@solana/kit';
import { Buffer } from 'buffer';
import {
  decodeEntry,
  decodeRound,
  getClaimPlaceInstruction,
  getCreateRoundInstruction,
  getEnterInstruction,
  getVoteInstruction,
  getEntryDecoder,
  getRoundDecoder,
  findEntryPda,
  findRoundPda,
  findVaultPda,
  findVotePda,
  type Entry,
  type Round,
} from './generated';
import {
  ASSOCIATED_TOKEN_PROGRAM,
  ENTRY_FEE,
  PROGRAM_ADDRESS,
  RPC_URL,
  SKR_MINT,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  roundEndsAt,
  roundIdFor,
  themeFor,
} from './config';

export type Rpc = ReturnType<typeof createSolanaRpc>;
export const rpc: Rpc = createSolanaRpc(RPC_URL);

/** What the wallet layer must provide: an address and a wire-transaction signer. */
export interface WireSigner {
  address: string;
  signWireTransaction(unsignedWireB64: string): Promise<string>;
}

// ── addresses ──────────────────────────────────────────────────────────────

export const roundAddress = (roundId: bigint) => findRoundPda({ roundId });
export const entryAddress = (round: Address, entrant: Address) => findEntryPda({ round, entrant });
export const voteAddress = (round: Address, voter: Address) => findVotePda({ round, voter });
export const vaultAddress = (round: Address) => findVaultPda({ round });

/**
 * The associated token account for (owner, mint), derived by hand.
 *
 * Deriving it costs six lines; a package that does it would pull a Kit 8 client
 * into a Kit 6 app for one PDA.
 */
export async function associatedTokenAddress(owner: Address, mint: Address = SKR_MINT): Promise<Address> {
  const enc = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [enc.encode(owner), enc.encode(TOKEN_PROGRAM), enc.encode(mint)],
  });
  return ata;
}

// ── reads ──────────────────────────────────────────────────────────────────

/** Today's round, or null when nobody has opened it yet. */
export async function fetchRound(roundId = roundIdFor()): Promise<Round | null> {
  const [addr] = await roundAddress(roundId);
  const { value } = await rpc.getAccountInfo(addr, { encoding: 'base64' }).send();
  if (!value) return null;
  return decodeRound({ address: addr, data: decodeBase64(value.data[0]), executable: false, exists: true, lamports: value.lamports, programAddress: address(value.owner), space: BigInt(value.space ?? 0) } as never).data;
}

export interface EntryWithAddress {
  address: Address;
  data: Entry;
}

/**
 * Every entry in a round, in ONE `getProgramAccounts` call.
 *
 * A call per card would be a hundred RPC requests on a busy day and public
 * endpoints rate-limit long before that. The filter is the Entry discriminator
 * plus the round key at its fixed offset (8 discriminator).
 */
export async function fetchEntries(round: Address): Promise<EntryWithAddress[]> {
  const { value: accounts } = await rpc
    .getProgramAccounts(PROGRAM_ADDRESS, {
      encoding: 'base64',
      // withContext so the response is {context, value}; without it the shape
      // differs between RPC providers.
      withContext: true,
      filters: [{ memcmp: { offset: 8n, bytes: round as unknown as Base58EncodedBytes, encoding: 'base58' } }],
    })
    .send();

  const decoder = getEntryDecoder();
  const out: EntryWithAddress[] = [];
  for (const acc of accounts) {
    const data = decodeBase64(acc.account.data[0]);
    // An account whose discriminator is not Entry's decodes to nonsense, so the
    // decode is attempted defensively: on-chain bytes are untrusted input.
    try {
      out.push({ address: acc.pubkey, data: decoder.decode(data) });
    } catch {
      /* not an Entry — skip */
    }
  }
  return out.sort((a, b) => b.data.votes - a.data.votes || Number(a.data.createdAt - b.data.createdAt));
}

/**
 * Every entry this wallet has ever made, newest round first, with the round it
 * belongs to.
 *
 * Read from the CHAIN rather than from device storage: a streak kept in
 * AsyncStorage is a number the device made up, lost on reinstall and trivially
 * edited. The Entry layout puts `entrant` right after `round`, so one filtered
 * getProgramAccounts finds them all.
 */
export async function fetchHistory(entrant: Address): Promise<{ entry: EntryWithAddress; round: Round; roundAddress: Address }[]> {
  const { value: accounts } = await rpc
    .getProgramAccounts(PROGRAM_ADDRESS, {
      encoding: 'base64',
      withContext: true,
      // 8 discriminator + 32 round = 40.
      filters: [{ memcmp: { offset: 40n, bytes: entrant as unknown as Base58EncodedBytes, encoding: 'base58' } }],
    })
    .send();

  const decoder = getEntryDecoder();
  const entries: EntryWithAddress[] = [];
  for (const acc of accounts) {
    try {
      entries.push({ address: acc.pubkey, data: decoder.decode(decodeBase64(acc.account.data[0])) });
    } catch {
      /* not an Entry */
    }
  }
  if (entries.length === 0) return [];

  // One getMultipleAccounts for every round involved, not one per entry.
  const roundKeys = [...new Set(entries.map((e) => e.data.round))];
  const { value: roundAccounts } = await rpc.getMultipleAccounts(roundKeys, { encoding: 'base64' }).send();
  const roundDecoder = getRoundDecoder();
  const rounds = new Map<string, Round>();
  roundKeys.forEach((key, i) => {
    const acc = roundAccounts[i];
    if (!acc) return;
    try {
      rounds.set(key, roundDecoder.decode(decodeBase64(acc.data[0])));
    } catch {
      /* not a Round */
    }
  });

  return entries
    .flatMap((entry) => {
      const round = rounds.get(entry.data.round);
      return round ? [{ entry, round, roundAddress: entry.data.round }] : [];
    })
    .sort((a, b) => Number(b.round.roundId - a.round.roundId));
}

/** Has this wallet already voted in this round? The Vote PDA existing is the answer. */
export async function hasVoted(round: Address, voter: Address): Promise<boolean> {
  const [addr] = await voteAddress(round, voter);
  const { value } = await rpc.getAccountInfo(addr, { encoding: 'base64' }).send();
  return value !== null;
}

/** SKR balance in base units — 0 when the wallet holds none (no token account). */
export async function skrBalance(owner: Address): Promise<bigint> {
  const ata = await associatedTokenAddress(owner);
  try {
    const { value } = await rpc.getTokenAccountBalance(ata).send();
    return BigInt(value.amount);
  } catch {
    return 0n;
  }
}

// ── writes ─────────────────────────────────────────────────────────────────

/**
 * Build, sign through the wallet, and send. One wallet prompt per call: MWA
 * shows a sheet per signing session, so two prompts for one tap reads as a bug.
 */
async function sendWithWallet(signer: WireSigner, instructions: Instruction[]): Promise<string> {
  const payer = address(signer.address);
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    // v0, not v1: these transactions are far inside the 1232-byte limit and MWA
    // wallets do not advertise v1 support yet. A wallet that cannot parse our
    // transaction is a dead end, and there is nothing to gain here.
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  const unsigned = getBase64EncodedWireTransaction(compileTransaction(message));
  const signedWire = await signer.signWireTransaction(unsigned);

  /**
   * The signature is read from the wallet's OWN bytes before anything is sent,
   * because the send is not the source of truth about whether this landed.
   *
   * Some wallets broadcast the transaction they just signed. Ours then arrives
   * second and the RPC rejects it with -32002 "already been processed" — an
   * error for a transaction that succeeded. The first real entry from a Seeker
   * showed exactly that: the fee was paid, the entry was on-chain, and the app
   * said it had failed.
   *
   * So: try to send, then ask the chain. A send error only matters if the
   * signature never confirms.
   */
  const signed = getTransactionDecoder().decode(getBase64Encoder().encode(signedWire));
  const signature = getSignatureFromTransaction(signed);

  let sendError: unknown = null;
  try {
    // Send the wallet's own bytes. Re-encoding them here is exactly how the
    // signature stops verifying.
    await rpc.sendTransaction(signedWire as never, { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
  } catch (err) {
    sendError = err;
  }

  const landed = await confirm(signature);
  if (!landed) throw sendError ?? new Error('The transaction did not confirm — nothing was charged.');
  return signature;
}

/** Poll until the signature confirms, or give up. ~20s covers a devnet hiccup. */
async function confirm(signature: string, attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const { value } = await rpc.getSignatureStatuses([signature as never]).send();
      const status = value[0];
      if (status?.err) return false;
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return true;
    } catch {
      /* transient RPC error — keep polling */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Open today's round — whoever gets there first.
 *
 * No cron, no server: the round account is created by the first player of the
 * day, and the theme comes from the shared list so what they write is what
 * everyone else already expects. They pay the account rent (a fraction of a
 * cent) and nothing else; creating a round grants no privilege over it.
 */
export async function openRound(signer: WireSigner, roundId = roundIdFor()): Promise<string> {
  const authority = address(signer.address);
  const [round] = await roundAddress(roundId);
  const [vault] = await vaultAddress(round);

  return sendWithWallet(signer, [
    getCreateRoundInstruction({
      authority: createNoopSigner(authority),
      round,
      mint: SKR_MINT,
      vault,
      tokenProgram: TOKEN_PROGRAM,
      systemProgram: SYSTEM_PROGRAM,
      roundId,
      theme: themeFor(roundId),
      entryFee: ENTRY_FEE,
      endsAt: BigInt(roundEndsAt(roundId)),
    }) as Instruction,
  ]);
}

/**
 * Enter the round with a finished generation.
 *
 * Called only AFTER the generation succeeded and the user chose to enter it: a
 * model that fails must never cost an entry fee.
 */
export async function enterRound(signer: WireSigner, roundId: bigint, mediaUri: string): Promise<string> {
  const entrant = address(signer.address);
  const [round] = await roundAddress(roundId);
  const [entry] = await entryAddress(round, entrant);
  const [vault] = await vaultAddress(round);
  const entrantTokens = await associatedTokenAddress(entrant);

  return sendWithWallet(signer, [
    getEnterInstruction({
      // A noop signer: the generated builder only needs to know this account
      // signs, so it marks the account meta correctly. The signature itself
      // comes from the wallet, over the whole wire transaction.
      entrant: createNoopSigner(entrant),
      round,
      entry,
      vault,
      entrantTokens,
      tokenProgram: TOKEN_PROGRAM,
      mediaUri,
    }) as Instruction,
  ]);
}

/** Vote for someone else's entry. Free beyond the network fee. */
export async function voteFor(signer: WireSigner, roundId: bigint, entry: Address): Promise<string> {
  const voter = address(signer.address);
  const [round] = await roundAddress(roundId);
  const [vote] = await voteAddress(round, voter);

  return sendWithWallet(signer, [
    getVoteInstruction({ voter: createNoopSigner(voter), round, entry, vote }) as Instruction,
  ]);
}

/**
 * Claim a place after the round ends. Permissionless by design — anyone can
 * push a winner's payout through, so a pot never waits on us.
 */
export async function claimPlace(
  signer: WireSigner,
  roundId: bigint,
  entry: Address,
  winner: Address,
  place: number,
): Promise<string> {
  const [round] = await roundAddress(roundId);
  const [vault] = await vaultAddress(round);
  const winnerTokens = await associatedTokenAddress(winner);

  return sendWithWallet(signer, [
    getClaimPlaceInstruction({ round, entry, vault, winnerTokens, tokenProgram: TOKEN_PROGRAM, place }) as Instruction,
  ]);
}

// ── helpers ────────────────────────────────────────────────────────────────

const decodeBase64 = (b64: string) => new Uint8Array(Buffer.from(b64, 'base64'));

/** Short form for display: `7xKX…mBvf`. */
// Round is fixed-size, so `dataSize` alone identifies it. Mirrors Round::SPACE
// in the program: 8 discriminator + 8 id + 32*3 keys + 4 + 80 theme + 8 fee
// + 8 ends_at + 4 count + 1 settled + 1 bump + 32*5 top + 4*5 top_votes.
const ROUND_SPACE = 398;
/** An unset Pubkey — what `top` holds for places nobody has taken. */
const DEFAULT_PUBKEY = '11111111111111111111111111111111' as Address;

/** One wallet's standing across every round that has ever ended. */
export interface Standing {
  entrant: Address;
  wins: number;      // rounds where this wallet held place 1 when the round ended
  places: number;    // top-five finishes, place 1 included
  votes: number;     // votes its winning entries drew
}

/**
 * The all-time board, built from the chain in two calls.
 *
 * The program has no per-player account: `Round` carries `top[5]` and nothing
 * aggregates across rounds. Adding a Player PDA would mean a program change and
 * a redeploy, so the ranking is derived on the client instead — the inputs are
 * still on-chain, and a wrong tally here cannot move anyone's money.
 *
 * Round is a fixed-size account, so `dataSize` finds every one of them without
 * needing a discriminator filter. Only rounds that have ENDED are counted: a
 * live round's `top` changes with every vote, and showing a crown that moves
 * during the day reads as a bug.
 */
export async function fetchStandings(now = Math.floor(Date.now() / 1000)): Promise<Standing[]> {
  const { value: accounts } = await rpc
    .getProgramAccounts(PROGRAM_ADDRESS, { encoding: 'base64', withContext: true, filters: [{ dataSize: BigInt(ROUND_SPACE) }] })
    .send();

  const decoder = getRoundDecoder();
  const ended: Round[] = [];
  for (const acc of accounts) {
    try {
      const r = decoder.decode(decodeBase64(acc.account.data[0]));
      if (Number(r.endsAt) <= now && r.entryCount > 0) ended.push(r);
    } catch {
      /* not a Round — skip */
    }
  }
  if (ended.length === 0) return [];

  // Every placed entry across every ended round, resolved in ONE call. `top`
  // holds ENTRY keys, and the wallet lives inside the Entry account.
  const placed: { entry: Address; place: number; votes: number }[] = [];
  for (const r of ended) {
    r.top.forEach((entry, i) => {
      if (entry !== DEFAULT_PUBKEY && r.topVotes[i] > 0) placed.push({ entry, place: i + 1, votes: r.topVotes[i] });
    });
  }
  const keys = [...new Set(placed.map((p) => p.entry))];
  const entrantOf = new Map<string, Address>();
  const entryDecoder = getEntryDecoder();
  // getMultipleAccounts caps at 100 keys per call.
  for (let i = 0; i < keys.length; i += 100) {
    const slice = keys.slice(i, i + 100);
    const { value } = await rpc.getMultipleAccounts(slice, { encoding: 'base64' }).send();
    value.forEach((acc, j) => {
      if (!acc) return;
      try {
        entrantOf.set(slice[j], entryDecoder.decode(decodeBase64(acc.data[0])).entrant);
      } catch {
        /* not an Entry — skip */
      }
    });
  }

  const by = new Map<string, Standing>();
  for (const p of placed) {
    const who = entrantOf.get(p.entry);
    if (!who) continue;
    const cur = by.get(who) ?? { entrant: who, wins: 0, places: 0, votes: 0 };
    cur.places += 1;
    if (p.place === 1) {
      cur.wins += 1;
      cur.votes += p.votes;
    }
    by.set(who, cur);
  }
  // Wins first, then the votes those wins drew, then breadth of finishes.
  return [...by.values()].sort((a, b) => b.wins - a.wins || b.votes - a.votes || b.places - a.places);
}

export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export { getBase58Decoder, decodeEntry };
