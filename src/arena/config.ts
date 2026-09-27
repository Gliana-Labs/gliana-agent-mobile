/**
 * Arena configuration — cluster, program, SKR mint, and what a round is.
 *
 * Devnet by default. SKR only exists on mainnet, so a devnet build points at a
 * mock mint (EXPO_PUBLIC_SKR_MINT) and the rest of the app does not care which
 * one it is talking to.
 */
import { address, type Address } from '@solana/kit';
import { ARENA_PROGRAM_ADDRESS } from './generated';
import THEME_LIST from './themes.json';

export const PROGRAM_ADDRESS = ARENA_PROGRAM_ADDRESS;

/** Mainnet SKR (SPL, 6 decimals) — the token the Arena runs on. */
export const SKR_MAINNET = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
export const SKR_DECIMALS = 6;

export const CLUSTER = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet';

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

export const SKR_MINT: Address = address(
  process.env.EXPO_PUBLIC_SKR_MINT ?? (CLUSTER === 'mainnet' ? SKR_MAINNET : SKR_MAINNET),
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
export const roundIdFor = (when: Date = new Date()): bigint =>
  BigInt(Math.floor(when.getTime() / 86_400_000));

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
export const THEMES: string[] = THEME_LIST;

export const themeFor = (roundId: bigint): string => THEMES[Number(roundId % BigInt(THEMES.length))];

/** What a round costs to enter, in SKR base units. Face value; holders pay 20% less. */
export const ENTRY_FEE = toSkrBase(5);

/** A round ends at the next UTC midnight. */
export const roundEndsAt = (roundId: bigint): number => Number(roundId + 1n) * 86_400;

/** SKR, formatted the way the UI shows it: no trailing zeros, no currency symbol. */
export const skr = (base: bigint | number): string => {
  const v = fromSkrBase(base);
  return v >= 1 ? v.toFixed(2).replace(/\.?0+$/, '') : v.toFixed(4).replace(/\.?0+$/, '');
};
