import type { Proposal } from './lib/api';

export interface GenerationResult {
  costMicroUsd: number;
  // Media outputs (image/video/audio) come back as a capability URL...
  url?: string;
  contentType?: string;
  /**
   * The generation started from a photo the player took in the app. A camera
   * round can then be a camera round: without this, "photograph your floor"
   * was enforceable only by asking nicely, because the picker offered every
   * finished generation whatever it came from.
   */
  fromCamera?: boolean;
  // ...everything else as raw JSON.
  raw?: unknown;
}

/** User edits on a proposal card, persisted so a reload doesn't wipe model/prompt. */
export interface ProposalDraft {
  model?: string;
  fields?: Record<string, unknown>;
  attachment?: string | null;
}

export interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  proposal?: Proposal | null;
  draft?: ProposalDraft;
  result?: GenerationResult;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  /** Started from the camera — see GenerationResult.fromCamera. */
  fromCamera?: boolean;
}
