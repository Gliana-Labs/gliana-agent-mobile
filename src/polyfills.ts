/**
 * Runtime polyfills — MUST be imported before any @solana/kit or @solana/mpp
 * code runs (index.ts imports this first).
 *
 * Hermes lacks the web APIs the Solana stack expects:
 *  - crypto.getRandomValues  → react-native-get-random-values
 *  - global Buffer           → buffer (base64 / wire-tx encoding)
 *  - SubtleCrypto Ed25519    → @solana/webcrypto-ed25519-polyfill (kit verifies
 *    signatures and derives addresses with it; the actual signing is done by the
 *    wallet over MWA, not here)
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { install as installEd25519 } from '@solana/webcrypto-ed25519-polyfill';
import { sha256, sha512 } from '@noble/hashes/sha2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (!g.Buffer) g.Buffer = Buffer;

// Adds Ed25519 sign/verify to crypto.subtle (and creates subtle on RN).
installEd25519();

// The Ed25519 polyfill doesn't provide crypto.subtle.digest, but @solana/kit
// needs SHA-256 for program-derived addresses (the USDC transfer derives an
// associated token account). Without it, paying throws "no digest implementation".
// Back it with @noble/hashes (pure JS, already in the tree).
const subtle = g.crypto?.subtle;
if (subtle && typeof subtle.digest !== 'function') {
  subtle.digest = async (algorithm: string | { name: string }, data: ArrayBuffer | ArrayBufferView) => {
    const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    let out: Uint8Array;
    if (name === 'SHA-256') out = sha256(bytes);
    else if (name === 'SHA-512') out = sha512(bytes);
    else throw new Error(`Unsupported digest algorithm: ${name}`);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  };
}
