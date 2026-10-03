/**
 * Arena configuration — cluster, program, SKR mint, and what a round is.
 *
 * MAINNET, on real SKR, since 2026-09-27 — program
 * 2CdzdzR1hj6w1ZjXLgvk3o2Saq5sXd1ufQ3Toww4PPHQ, deployed with --max-len at the
 * binary's exact size so the rent is 1.49 SOL rather than 2.99.
 *
 * A devnet build still works: point EXPO_PUBLIC_SOLANA_CLUSTER at devnet and
 * EXPO_PUBLIC_SKR_MINT at the mock mint. SKR only exists on mainnet, and the
 * rest of the app does not care which one it is talking to.
 */
import { address, type Address } from '@solana/kit';
import { ARENA_PROGRAM_ADDRESS } from './generated';
import THEME_LIST from './themes.json';

export const PROGRAM_ADDRESS = ARENA_PROGRAM_ADDRESS;

/** Mainnet SKR (SPL, 6 decimals) — the token the Arena runs on. */
export const SKR_MAINNET = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const SKR_DECIMALS = 6;

export const CLUSTER = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'mainnet') as 'devnet' | 'mainnet';

/**
 * The Arena's RPC — its OWN variable, deliberately not EXPO_PUBLIC_SOLANA_RPC.
 *
 * That one is the payment path's mainnet RPC (lib/pay.ts fetches a blockhash
 * from it to pay for generations). Pointing it at devnet so the Arena could run
 * there would hand a devnet blockhash to a mainnet USDC transfer, which fails
 * after the user has already approved it in their wallet.
 */
export const RPC_URL =
  process.env.EXPO_PUBLIC_ARENA_RPC ??
  (CLUSTER === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');

/**
 * Both branches used to read SKR_MAINNET, so a devnet build with the env var
 * unset silently looked for a mainnet mint on devnet and found nothing.
 */
export const SKR_DEVNET_MOCK = '8799cfUwjoqSEqQNhTmGsNdLLmWcwF5fnQEv97srGbRD';
export const SKR_MINT: Address = address(
  process.env.EXPO_PUBLIC_SKR_MINT ?? (CLUSTER === 'mainnet' ? SKR_MAINNET : SKR_DEVNET_MOCK),
);

export const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');

/** Whole SKR → base units, for display and for building instructions. */
export const toSkrBase = (whole: number): bigint => BigInt(Math.round(whole * 10 ** SKR_DECIMALS));
export const fromSkrBase = (base: bigint | number): number => Number(base) / 10 ** SKR_DECIMALS;

/**
 * A round is a UTC day, and its id is the day number. Derived rather than
 * stored so every client agrees on today's round without asking a server —
 * there is no server.
 */
/**
 * When a round rolls over, in hours past UTC midnight.
 *
 * 12:00 UTC is 19:00 in Jakarta — the evening, when people are on their phones.
 * A plain UTC day ends at 07:00 WIB, so the previous design flipped the theme,
 * closed the voting and paid the pot while the players were asleep, and the
 * "ends in" countdown spent all evening reading eleven hours. A daily contest
 * should turn over when its audience is awake.
 *
 * The chain does not care: `round_id` is just a number the program stores, and
 * `ends_at` is a timestamp it checks against the clock. Both sides of the app
 * and the opener script derive from THIS constant, so they cannot disagree.
 */
export const ROLL_HOUR_UTC = 12;
const ROLL_MS = ROLL_HOUR_UTC * 3_600_000;

/**
 * A round is identified by the UTC day it ENDS on, not the one it starts on —
 * which is what makes the shift work without colliding with rounds already on
 * chain: a round opened under the old midnight-UTC scheme keeps its number, and
 * the first round under the new schedule simply takes the next one.
 */
export const roundIdFor = (when: Date = new Date()): bigint =>
  BigInt(Math.floor((when.getTime() + ROLL_MS) / 86_400_000));

/**
 * The daily themes, in a fixed list indexed by round id.
 *
 * DERIVED, not fetched. The first player of the day is the one who creates the
 * round account, and they write the theme into it — so every client has to
 * agree on what today's theme is BEFORE the account exists, or the opener
 * writes something nobody else expected. A list plus the day number does that
 * with no server, which is the same reason the round id is the day number.
 *
 * The list lives in themes.json rather than here because the round OPENER is a
 * node script outside this bundle (program/arena/scripts/open-round.mjs) and it
 * has to write the same string the app expects. Two copies of this list is one
 * copy too many: a drifted entry means the app shows a theme nobody was
 * generating for.
 */
/**
 * What medium a round is contested in.
 *
 * ONE medium per round, not per entry. A grid of images is judged in a glance;
 * four songs is two minutes of listening before anyone can vote, and votes are
 * already the scarce resource here. Mixing them in one gallery would make a
 * silent thumbnail compete with a track on unequal terms, so the round decides
 * and every entry in it is the same kind.
 *
 * It lives in themes.json, NOT on chain: the opener writes only the theme
 * string, and every client derives the rest from the same file. Putting it in
 * the Round account would have meant a program change for a client concern.
 */
export type ThemeKind = 'image' | 'video' | 'music';

export interface Theme {
  text: string;
  kind: ThemeKind;
}

export const THEMES: Theme[] = THEME_LIST as Theme[];

const themeAt = (roundId: bigint): Theme => THEMES[Number(roundId % BigInt(THEMES.length))];

export const themeFor = (roundId: bigint): string => themeAt(roundId).text;

/** The medium today's round is contested in. */
export const kindFor = (roundId: bigint): ThemeKind => themeAt(roundId).kind;

/**
 * Which generated results may be staked in a round of this kind.
 *
 * Matched on the result's own contentType rather than the model that made it:
 * a model can return something other than its headline modality, and the entry
 * is judged on what it IS, not what produced it.
 */
export const acceptsContentType = (kind: ThemeKind, contentType: string | undefined): boolean => {
  const t = contentType ?? '';
  if (kind === 'video') return t.startsWith('video/');
  if (kind === 'music') return t.startsWith('audio/');
  return t.startsWith('image/');
};

/** What a round costs to enter, in SKR base units. Face value; holders pay 20% less. */
export const ENTRY_FEE = toSkrBase(5);

/** A round ends at the next UTC midnight. */
export const roundEndsAt = (roundId: bigint): number =>
  Number(roundId) * 86_400 + ROLL_HOUR_UTC * 3_600;

/** SKR, formatted the way the UI shows it: no trailing zeros, no currency symbol. */
export const skr = (base: bigint | number): string => {
  const v = fromSkrBase(base);
  return v >= 1 ? v.toFixed(2).replace(/\.?0+$/, '') : v.toFixed(4).replace(/\.?0+$/, '');
};

/**
 * The medium of ONE entry, read from its URL.
 *
 * A round has a kind, but `enter` is a permissionless instruction that takes
 * any URI — the app only offers you matching results, a script can post
 * anything. Rendering every entry as the round's kind put an mp3 in a video
 * view: a black tile that played sound nobody asked for. Each cell trusts the
 * file; the round's kind is only the fallback when the URL says nothing.
 */
export const kindForUri = (uri: string): ThemeKind | undefined => {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(uri)?.[1]?.toLowerCase();
  if (!ext) return undefined;
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'music';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext)) return 'image';
  return undefined;
};
