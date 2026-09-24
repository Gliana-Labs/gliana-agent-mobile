/**
 * A cheap peek at today's round, for the chat header.
 *
 * Deliberately NOT useArena: that polls four RPC calls every 20s to drive the
 * Arena screens, and running it behind the chat as well would double the load
 * on a public endpoint for a pill. This is one account read a minute.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchRound } from './client';
import { roundIdFor } from './config';

export function usePeek(): { endsAt: number | null; open: boolean } {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const read = () =>
      fetchRound(roundIdFor())
        .then((r) => alive.current && setEndsAt(r ? Number(r.endsAt) : null))
        .catch(() => {
          /* offline or rate-limited — the pill just says "Arena" */
        });
    void read();
    const t = setInterval(read, 60_000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, []);

  return { endsAt, open: endsAt !== null && endsAt * 1000 > Date.now() };
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
