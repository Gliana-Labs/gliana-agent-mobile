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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
if (!g.Buffer) g.Buffer = Buffer;

installEd25519();
