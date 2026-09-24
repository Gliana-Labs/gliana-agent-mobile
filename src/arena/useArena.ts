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
  enterRound,
  fetchEntries,
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
import type { Round } from './generated';

/** Hold this much SKR and the program charges 20% less — see the program's HOLDER_THRESHOLD. */
export const HOLDER_THRESHOLD = 100_000_000n;
export const HOLDER_FEE_BPS = 8_000n;

export const feeFor = (held: bigint, faceValue: bigint = ENTRY_FEE): bigint =>
  held >= HOLDER_THRESHOLD ? (faceValue * HOLDER_FEE_BPS) / 10_000n : faceValue;

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
  loading: boolean;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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
      if (signer) {
        const me = address(signer.address);
        const [v, balance] = await Promise.all([hasVoted(addr, me), skrBalance(me)]);
        if (!alive.current) return;
        setVoted(v);
        setHeld(balance);
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
    open: () => act((s) => openRound(s, roundId)),
    enter: (mediaUri: string) => act((s) => enterRound(s, roundId, mediaUri)),
    vote: (entry: Address) => act((s) => voteFor(s, roundId, entry)),
  };
}

/**
 * Wallet and RPC errors arrive as walls of text. Pull out the ones a player can
 * act on and keep the rest short — an error nobody reads is an error nobody fixes.
 */
function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/insufficient funds|InsufficientFunds|0x1$/i.test(raw)) return 'Not enough SKR for the entry fee.';
  if (/already in use|AccountAlreadyInitialized/i.test(raw)) return 'You have already done that in this round.';
  if (/SelfVote/i.test(raw)) return 'You cannot vote for your own entry.';
  if (/RoundClosed|RoundOpen/i.test(raw)) return 'The round has closed.';
  if (/declined|rejected|User rejected|cancell?ed/i.test(raw)) return 'Cancelled in the wallet.';
  if (/blockhash|Blockhash not found/i.test(raw)) return 'Network was busy — try that again.';
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
}
