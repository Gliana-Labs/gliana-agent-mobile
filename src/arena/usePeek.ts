/**
 * A cheap peek at today's round, for the chat header.
 *
 * Deliberately NOT useArena: that polls four RPC calls every 20s to drive the
 * Arena screens, and running it behind the chat as well would double the load
 * on a public endpoint for a pill. This is one account read a minute.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchRound } from './client';
import { roundIdFor, themeFor } from './config';

export interface Peek {
  endsAt: number | null;
  /** The round's own theme once it exists, else today's derived one. */
  theme: string;
  entries: number;
  open: boolean;
}

export function usePeek(): Peek {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  // The round account carries the theme and the entry count, so the home card
  // costs the same one read as the header pill did.
  const [theme, setTheme] = useState(() => themeFor(roundIdFor()));
  const [entries, setEntries] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const read = () =>
      fetchRound(roundIdFor())
        .then((r) => {
          if (!alive.current) return;
          setEndsAt(r ? Number(r.endsAt) : null);
          setEntries(r?.entryCount ?? 0);
          if (r?.theme) setTheme(r.theme);
        })
        .catch(() => {
          /* offline or rate-limited — the card falls back to the derived theme */
        });
    void read();
    const t = setInterval(read, 60_000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, []);

  return { endsAt, theme, entries, open: endsAt !== null && endsAt * 1000 > Date.now() };
}

/** "3h 21m" / "47m" / null — minute resolution, because that is how often it ticks. */
export function timeLeft(endsAt: number | null, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = endsAt * 1000 - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
