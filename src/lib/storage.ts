/**
 * Conversation persistence — AsyncStorage replaces the web app's localStorage.
 * The agent worker keeps the authoritative server-side copy (its DO, keyed by
 * conversationId); this is just the local mirror so history survives restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Conversation } from '../types';

const KEY = 'gliana-agent:conversations:v1';

export interface StoredState {
  conversations: Conversation[];
  activeId: string | null;
}

export async function loadState(): Promise<StoredState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as StoredState;
  } catch {
    // corrupt storage — start fresh
  }
  return { conversations: [], activeId: null };
}

export async function saveState(state: StoredState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // best-effort
  }
}

/**
 * The wallet session: the MWA auth token and the account it belongs to.
 *
 * Kept because the token is what `reauthorize` needs, and without it every cold
 * start put the user back through the wallet's connect sheet — in a daily game,
 * a reconnect before every visit is the friction that ends the habit.
 *
 * This is NOT a key or a signing capability. It is a handle the wallet issued
 * for this app, and the wallet can revoke it; the worst a reader of this device
 * gains is the address, which is public on-chain anyway.
 */
const WALLET_KEY = 'gliana-agent:wallet:v1';

export interface StoredWallet {
  address: string;
  label?: string;
  authToken: string;
}

export async function loadWallet(): Promise<StoredWallet | null> {
  try {
    const raw = await AsyncStorage.getItem(WALLET_KEY);
    return raw ? (JSON.parse(raw) as StoredWallet) : null;
  } catch {
    return null;
  }
}

export async function saveWallet(w: StoredWallet | null): Promise<void> {
  try {
    if (w) await AsyncStorage.setItem(WALLET_KEY, JSON.stringify(w));
    else await AsyncStorage.removeItem(WALLET_KEY);
  } catch {
    /* a device that cannot persist still works, it just reconnects */
  }
}
