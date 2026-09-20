// Types for devproxy.mjs so vite.config.ts can import it under `strict`. The module stays
// plain JavaScript on purpose: it is a Node script that also runs standalone (see its header).
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Value of `name` from the environment, else from .env.local, else null. */
export function readLocalEnv(name: string): string | null;

export type ProviderId = 'gemini' | 'featherless' | 'xai';

/** The scene-model providers, keyed by id: endpoint, which env vars name the key and model. */
export const MODEL_PROVIDERS: Record<
  ProviderId,
  { chat: string; keyEnv: string; modelEnv: string; defaultModel: string; body?: Record<string, unknown>; vision?: boolean }
>;

/** The provider used when MODEL_PROVIDER is unset and both keys are present. */
export const DEFAULT_PROVIDER: ProviderId;

/**
 * The model this machine can reach, or null when no usable key is set. With `vision`, only
 * providers tried on a camera frame are considered, so the frame never lands on a text-only
 * model just because MODEL_PROVIDER named one.
 */
export function resolveProvider(
  name?: string | null,
  options?: { vision?: boolean },
): {
  id: ProviderId;
  key: string;
  chat: string;
  model: string;
} | null;

/** The app's question to the model, with a frame for the scene call and without one for the intent call. */
export function askModel(o: {
  provider?: ProviderId;
  chat?: string;
  key: string;
  model: string;
  image?: string | null;
  mime?: 'image/jpeg' | 'image/png';
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text: string; model: string; provider: ProviderId; latencyMs: number }>;

/** Node request handler that adds the keys to the allowed upstream calls; a route without its key answers 404. */
export function createKeyProxy(o: {
  apiKey?: string | null;
  agentId?: string | null;
  /** ELEVENLABS_COACH_VOICE: a voice id or a name in the account's library; null keeps the default. */
  coachVoice?: string | null;
  provider?: { id: ProviderId; key: string; chat: string; model: string } | null;
  /** Serves /vision/assess. Defaults to `provider`; differs when the text model has no vision. */
  visionProvider?: { id: ProviderId; key: string; chat: string; model: string } | null;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
