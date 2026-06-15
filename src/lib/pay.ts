/**
 * Pay the gateway's 402 over the Solana rail and run the model.
 *
 * Ports the web app's lib/pay.ts. The web app supported two rails (EVM/Base via
 * wagmi + Solana via wallet-standard); on mobile we use the Solana Mobile Wallet
 * Adapter only, so this is Solana-only. mppx + @solana/mpp do the exact same MPP
 * 402 dance — we just feed `solana.charge` an MWA-backed kit signer (lib/mwa.ts).
 *
 * The wallet SIGNS the USDC transfer (broadcast:false default); the gateway
 * broadcasts it. A public Solana RPC is used to fetch a recent blockhash;
 * override with EXPO_PUBLIC_SOLANA_RPC.
 */
import { Mppx } from 'mppx/client';
import { solana } from '@solana/mpp/client';
import type { TransactionPartialSigner } from '@solana/kit';
import { API } from './api';

const SOLANA_RPC = process.env.EXPO_PUBLIC_SOLANA_RPC;

export interface MediaOutput {
  url: string;
  contentType: string;
  sizeBytes: number;
}

export interface InferResult {
  model: string;
  costMicroUsd: number;
  output: unknown;
}

/**
 * Pull a renderable media URL out of an inference result. Prefers the gateway's
 * re-hosted shape ({url, contentType}); falls back to raw provider JSON.
 */
export function asMedia(output: unknown): MediaOutput | null {
  const o = output as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;

  if (typeof o.url === 'string' && typeof o.contentType === 'string') {
    return o as unknown as MediaOutput;
  }

  const containers = [o.result, o.output, o].filter(
    (c): c is Record<string, unknown> => !!c && typeof c === 'object',
  );
  for (const c of containers) {
    for (const k of ['audio', 'image', 'video', 'url']) {
      const v = c[k];
      if (typeof v === 'string' && /^https?:\/\//.test(v)) {
        return { url: v, contentType: guessContentType(v, k), sizeBytes: 0 };
      }
    }
  }
  return null;
}

function guessContentType(url: string, key: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    mp4: 'video/mp4', webm: 'video/webm',
  };
  if (byExt[ext]) return byExt[ext];
  return key === 'audio' ? 'audio/mpeg' : key === 'video' ? 'video/mp4' : 'image/png';
}

export async function payAndRun(
  signer: TransactionPartialSigner,
  body: Record<string, unknown>,
): Promise<InferResult> {
  // Retry once on a failed settle — a fresh request gets a fresh 402 challenge
  // and a fresh recentBlockhash, which fixes "Blockhash not found" when a wallet
  // approval takes longer than Solana's ~90s blockhash window.
  let res = await attempt(signer, body);
  if (res.status === 402) res = await attempt(signer, body);

  if (res.status === 402) {
    throw new Error('Payment did not settle — check the wallet holds USDC on Solana and approve promptly.');
  }
  if (res.status === 400) {
    const e = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(e.detail ?? 'Missing required input — nothing was charged.');
  }
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(e.detail ?? e.error ?? `Request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as InferResult;
}

function attempt(signer: TransactionPartialSigner, body: Record<string, unknown>): Promise<Response> {
  // Fresh client per attempt so a stale challenge is never reused.
  const mppx = Mppx.create({
    methods: [solana.charge({ signer: signer as never, ...(SOLANA_RPC ? { rpcUrl: SOLANA_RPC } : {}) })] as never,
    polyfill: false,
  });
  return mppx.fetch(`${API}/v1/infer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
