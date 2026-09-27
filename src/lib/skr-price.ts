/**
 * What one SKR is worth, read from the pool rather than asked of an API.
 *
 * The gateway prices SKR payments the same way (apps/gateway/src/lib/skr.ts)
 * and its quote is the one that binds — this exists so the card can say "≈0.98
 * SKR" BEFORE the wallet opens. Approving a transfer whose size you first learn
 * inside the wallet sheet is how people lose trust in a payment flow.
 *
 * The deepest SKR/USDC pool is an Orca whirlpool, and its account carries the
 * spot price. Its RESERVES do not: concentrated liquidity keeps most of the
 * token outside the active range, so dividing the vaults reads ~12% low.
 * `sqrtPrice` is the price, and with both sides at 6 decimals (sqrt/2^64)^2 is
 * USDC per SKR directly.
 */
import { RPC_URL } from '../arena/config';

const WHIRLPOOL = 'VY1ZQXjqBwvuWgVfTfhqanJe96GGoQrX7xZZDrWPGiT';
const SQRT_PRICE_OFFSET = 65;
/** Long enough that opening the card twice is one read; short enough to track a move. */
const TTL_MS = 60_000;

let cache: { usd: number; at: number } | null = null;

export async function skrUsd(): Promise<number | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.usd;
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [WHIRLPOOL, { encoding: 'base64' }],
      }),
    });
    const body = (await res.json()) as { result?: { value?: { data?: [string, string] } } };
    const data = body.result?.value?.data?.[0];
    if (!data) return null;
    const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    let sqrt = 0n;
    for (let i = SQRT_PRICE_OFFSET + 15; i >= SQRT_PRICE_OFFSET; i--) sqrt = sqrt * 256n + BigInt(raw[i]);
    const root = Number(sqrt) / 2 ** 64;
    const usd = root * root;
    if (!Number.isFinite(usd) || usd <= 0) return null;
    cache = { usd, at: Date.now() };
    return usd;
  } catch {
    // No price means the card shows "SKR" without an estimate — the gateway's
    // challenge still carries the real amount, and the wallet still shows it.
    return null;
  }
}

/**
 * What the card should estimate for a call priced at `microUsd`.
 *
 * Mirrors the gateway's 5% haircut, so the number shown is the number the
 * challenge will ask for rather than a spot figure the user then sees grow
 * inside their wallet.
 */
export function skrEstimate(microUsd: number, usdPerSkr: number): number {
  return microUsd / 1e6 / (usdPerSkr * 0.95);
}
