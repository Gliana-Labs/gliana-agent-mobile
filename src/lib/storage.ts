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
