/**
 * GlianaAI clients (mobile). The gateway (api.glianalabs.com) owns
 * models/prices/schema/paid inference; the agent worker owns the free chat that
 * picks a model and returns a priced proposal.
 *
 * Env: Expo inlines EXPO_PUBLIC_* at build time (mirrors the web app's VITE_*).
 *  - EXPO_PUBLIC_API_URL   gateway base (defaults to production)
 *  - EXPO_PUBLIC_AGENT_URL deployed gliana-agent worker. Unset = stub replies.
 */
export const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.glianalabs.com';
const AGENT = process.env.EXPO_PUBLIC_AGENT_URL;

export interface ModelRow {
  id: string;
  runId: string;
  provider: string;
  category: string;
  unit: string;
  unitPriceMicroUsd: number;
  priceLabel?: string;
}

export async function fetchModels(): Promise<ModelRow[]> {
  const res = await fetch(`${API}/v1/models`);
  if (!res.ok) throw new Error(`models: ${res.status}`);
  return ((await res.json()) as { models: ModelRow[] }).models;
}

export interface Quote {
  model: string;
  category: string;
  costMicroUsd: number; // crypto price (provider cost × markup) — what the wallet pays
  cardChargeMicroUsd?: number;
  unit: string;
  units: number;
  unitPriceMicroUsd: number;
}

// Tracks the same billing fields the gateway charges on (duration, text length,
// resolution tier) so the shown number equals what /v1/infer takes.
export async function quote(
  model: string,
  params?: { duration?: number; text?: string; resolution?: string },
): Promise<Quote> {
  const q = new URLSearchParams({ model });
  if (params?.duration) q.set('duration', String(params.duration));
  if (params?.text) q.set('text', params.text);
  if (params?.resolution) q.set('resolution', params.resolution);
  const res = await fetch(`${API}/v1/price?${q}`);
  if (!res.ok) throw new Error(`price: ${res.status}`);
  return (await res.json()) as Quote;
}

export interface PropSchema {
  type?: string;
  default?: unknown;
  enum?: unknown[];
  min?: number;
  max?: number;
  fileRef?: boolean;
  description?: string;
}
export interface ModelSchema {
  model: string;
  category: string;
  required: string[];
  props: Record<string, PropSchema>;
}

export async function fetchSchema(model: string): Promise<ModelSchema> {
  const res = await fetch(`${API}/v1/schema?model=${encodeURIComponent(model)}`);
  if (!res.ok) throw new Error(`schema: ${res.status}`);
  return (await res.json()) as ModelSchema;
}

export { usd } from '../theme';

/** A generation the agent wants approved: exact /v1/infer body + gateway quote. */
export interface Proposal {
  model: string;
  category: string;
  input: Record<string, unknown>;
  quote: Quote;
}

export interface AgentTurn {
  conversationId: string;
  reply: string;
  proposal: Proposal | null;
}

export const agentConfigured = Boolean(AGENT);

export async function agentChat(
  conversationId: string,
  message: string,
  turnstileToken?: string,
): Promise<AgentTurn> {
  const res = await fetch(`${AGENT}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId, message, turnstileToken }),
  });
  if (!res.ok) throw new Error(`agent: ${res.status}`);
  return (await res.json()) as AgentTurn;
}

/** Wipe the server-side copy (the agent's DO) of a deleted conversation. */
export async function agentDeleteConversation(conversationId: string): Promise<void> {
  if (!AGENT) return;
  await fetch(`${AGENT}/v1/chat/${conversationId}`, { method: 'DELETE' }).catch(() => {});
}
