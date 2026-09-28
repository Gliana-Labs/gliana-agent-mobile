/**
 * Everything the Arena screens need, in one hook: today's round, its entries,
 * what this wallet has already done, and the three actions.
 *
 * One poll loop, not one per screen — public RPC endpoints rate-limit, and the
 * gallery is the kind of view that invites a refresh on every render.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { address, type Address } from '@solana/kit';
import {
  claimPlace,
  enterRound,
  fetchEntries,
  fetchHistory,
  fetchRound,
  hasVoted,
  openRound,
  roundAddress,
  skrBalance,
  voteFor,
  type EntryWithAddress,
  type WireSigner,
} from './client';
import { ENTRY_FEE, roundIdFor, themeFor } from './config';
import { offerQuestReminder } from '../lib/quest-reminder';
import type { Round } from './generated';

/** Hold this much SKR and the program charges 20% less — see the program's HOLDER_THRESHOLD. */
export const HOLDER_THRESHOLD = 100_000_000n;
export const HOLDER_FEE_BPS = 8_000n;

export const feeFor = (held: bigint, faceValue: bigint = ENTRY_FEE): bigint =>
  held >= HOLDER_THRESHOLD ? (faceValue * HOLDER_FEE_BPS) / 10_000n : faceValue;

/** A finished round this wallet placed in, and what is still owed. */
export interface Placing {
  roundId: bigint;
  place: number;
  entry: Address;
  votes: number;
  claimed: boolean;
  /** Ended and still unclaimed — the only case with a button. */
  claimable: boolean;
}

export interface History {
  /** Consecutive days entered, counting back from today (or yesterday, if today is still open). */
  streak: number;
  entered: number;
  wins: number;
  placings: Placing[];
}

/** Yesterday's round, as a one-line result. Null when there wasn't one. */
export interface Yesterday {
  roundId: bigint;
  theme: string;
  winner: string | null;
  winnerVotes: number;
  mediaUri: string | null;
  /** Your placing in it, if you had one. */
  mine: Placing | null;
}

export interface ArenaState {
  roundId: bigint;
  theme: string;
  /** null while loading, and when nobody has opened today's round yet. */
  round: Round | null;
  roundOpen: boolean;
  entries: EntryWithAddress[];
  /** This wallet's entry in today's round, if it has one. */
  mine: EntryWithAddress | null;
  voted: boolean;
  held: bigint;
  fee: bigint;
  isHolder: boolean;
  pot: bigint;
  endsAt: number | null;
  history: History;
  yesterday: Yesterday | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  claim: (p: Placing) => Promise<void>;
  open: () => Promise<void>;
  enter: (mediaUri: string) => Promise<void>;
  vote: (entry: Address) => Promise<void>;
}

const POLL_MS = 20_000;

export function useArena(signer: WireSigner | null): ArenaState {
  const roundId = useMemo(() => roundIdFor(), []);
  const theme = useMemo(() => themeFor(roundId), [roundId]);

  const [round, setRound] = useState<Round | null>(null);
  const [entries, setEntries] = useState<EntryWithAddress[]>([]);
  const [voted, setVoted] = useState(false);
  const [held, setHeld] = useState(0n);
  const [history, setHistory] = useState<History>({ streak: 0, entered: 0, wins: 0, placings: [] });
  const [yesterday, setYesterday] = useState<Yesterday | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A refresh that lands after the component unmounts would set state on a
  // dead tree; RN warns and, worse, keeps the timer alive.
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [addr] = await roundAddress(roundId);
      const [r, e] = await Promise.all([fetchRound(roundId), fetchEntries(addr)]);
      if (!alive.current) return;
      setRound(r);
      setEntries(e);
      setError(null);
      void loadYesterday(roundId).then((y) => alive.current && setYesterday(y));
      if (signer) {
        const me = address(signer.address);
        const [v, balance, past] = await Promise.all([hasVoted(addr, me), skrBalance(me), fetchHistory(me)]);
        if (!alive.current) return;
        setVoted(v);
        setHeld(balance);
        setHistory(summarise(past, roundId));
      }
    } catch (err) {
      if (alive.current) setError(readableError(err));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [roundId, signer]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [refresh]);

  /** Run a wallet action, then refresh — so the UI shows the chain, not a guess. */
  const act = useCallback(
    async (fn: (s: WireSigner) => Promise<string>) => {
      if (!signer) throw new Error('Connect a wallet first');
      setBusy(true);
      setError(null);
      try {
        await fn(signer);
        await refresh();
      } catch (err) {
        setError(readableError(err));
        throw err;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [signer, refresh],
  );

  const mine = useMemo(
    () => (signer ? (entries.find((e) => e.data.entrant === signer.address) ?? null) : null),
    [entries, signer],
  );

  return {
    roundId,
    theme: round?.theme ?? theme,
    round,
    roundOpen: round !== null,
    entries,
    mine,
    voted,
    held,
    fee: feeFor(held, round?.entryFee ?? ENTRY_FEE),
    isHolder: held >= HOLDER_THRESHOLD,
    pot: BigInt(entries.reduce((sum, e) => sum + Number(e.data.paidFee), 0)),
    endsAt: round ? Number(round.endsAt) : null,
    loading,
    busy,
    error,
    refresh,
    history,
    yesterday: yesterday
      ? { ...yesterday, mine: history.placings.find((p) => p.roundId === yesterday.roundId) ?? null }
      : null,
    claim: (p: Placing) => act((s) => claimPlace(s, p.roundId, p.entry, address(s.address), p.place)),
    open: () => act((s) => openRound(s, roundId)),
    /**
     * Entering is the moment to ask about the daily reminder: the player has
     * just staked SKR on a round that ends tonight, so a nudge tomorrow is
     * obviously useful. Asking on first launch, before anyone knows what the
     * app does, is how you collect a permanent "no".
     */
    enter: (mediaUri: string) =>
      act((s) => enterRound(s, roundId, mediaUri)).then(() => {
        void offerQuestReminder();
      }),
    vote: (entry: Address) => act((s) => voteFor(s, roundId, entry)),
  };
}

/**
 * Yesterday's winner, read from that round's own leaderboard.
 *
 * The round account already ranks its top five (the program keeps it updated on
 * every vote), so this is two reads, not a tally over every entry.
 */
async function loadYesterday(today: bigint): Promise<Yesterday | null> {
  const roundId = today - 1n;
  const round = await fetchRound(roundId);
  if (!round) return null;
  const [addr] = await roundAddress(roundId);
  const entries = await fetchEntries(addr);
  const top = round.top[0];
  const winner = entries.find((e) => e.address === top) ?? null;
  return {
    roundId,
    theme: round.theme,
    winner: winner?.data.entrant ?? null,
    winnerVotes: winner?.data.votes ?? 0,
    mediaUri: winner?.data.mediaUri ?? null,
    mine: null,
  };
}

/**
 * Turn the chain's version of this wallet's history into the three numbers the
 * profile shows, plus what it can still claim.
 */
function summarise(
  past: Awaited<ReturnType<typeof fetchHistory>>,
  today: bigint,
): History {
  const now = Math.floor(Date.now() / 1000);
  const placings: Placing[] = [];

  for (const { entry, round } of past) {
    const place = round.top.findIndex((k) => k === entry.address) + 1;
    if (place === 0) continue;
    placings.push({
      roundId: round.roundId,
      place,
      entry: entry.address,
      votes: entry.data.votes,
      claimed: entry.data.paid,
      claimable: !entry.data.paid && now >= Number(round.endsAt),
    });
  }

  // A streak counts back from today, or from yesterday while today is still
  // open — otherwise every streak would read as broken until you entered.
  const days = new Set(past.map(({ round }) => round.roundId));
  let streak = 0;
  for (let day = days.has(today) ? today : today - 1n; days.has(day); day -= 1n) streak++;

  return {
    streak,
    entered: past.length,
    wins: placings.filter((p) => p.place === 1).length,
    placings,
  };
}

/**
 * Wallet and RPC errors arrive as walls of text. Pull out the ones a player can
 * act on and keep the rest short — an error nobody reads is an error nobody fixes.
 */
function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  /**
   * Rent, not the fee, and not SKR. Voting creates a Vote PDA and the voter
   * pays its rent (~0.00086 SOL); a wallet that cannot cover that AND stay
   * rent-exempt itself fails with InsufficientFundsForRent on account 0.
   *
   * This was reported to a real user as "the network refused that transaction"
   * — the -32002 catch-all below swallowed it — and cost two wallet approvals
   * and a chain simulation to identify. Name the actual problem.
   */
  if (/InsufficientFundsForRent/i.test(raw)) {
    return 'Not enough SOL in your wallet to cover the network rent for this action.';
  }
  if (/insufficient funds|InsufficientFunds|0x1$/i.test(raw)) return 'Not enough SKR for the entry fee.';
  if (/already in use|AccountAlreadyInitialized/i.test(raw)) return 'You have already done that in this round.';
  if (/SelfVote/i.test(raw)) return 'You cannot vote for your own entry.';
  if (/RoundClosed|RoundOpen/i.test(raw)) return 'The round has closed.';
  if (/declined|rejected|User rejected|cancell?ed/i.test(raw)) return 'Cancelled in the wallet.';
  if (/blockhash|Blockhash not found/i.test(raw)) return 'Network was busy — try that again.';
  // -32002 is a preflight failure. It is usually a duplicate submission, which
  // the confirm-by-signature path above already treats as success; anything
  // reaching here genuinely did not land.
  if (/-32002|preflight/i.test(raw)) return 'The network refused that transaction — nothing was charged.';
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
}
