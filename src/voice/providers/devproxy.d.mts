// Types for devproxy.mjs so vite.config.ts can import it under `strict`. The module stays
// plain JavaScript on purpose: it is a Node script that also runs standalone (see its header).
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Value of `name` from the environment, else from .env.local, else null. */
export function readLocalEnv(name: string): string | null;

export type VisionProviderId = 'gemini' | 'featherless';

/** The scene-model providers, keyed by id: endpoint, which env vars name the key and model. */
export const VISION_PROVIDERS: Record<
  VisionProviderId,
  { chat: string; keyEnv: string; modelEnv: string; defaultModel: string }
>;

/** The provider used when VISION_PROVIDER is unset and both keys are present. */
export const DEFAULT_VISION_PROVIDER: VisionProviderId;

/** The scene model this machine can reach, or null when no vision key is configured. */
export function resolveVisionProvider(name?: string | null): {
  id: VisionProviderId;
  key: string;
  chat: string;
  model: string;
} | null;

/** The app's question to the model, with a frame for the scene call and without one for the intent call. */
export function askModel(o: {
  provider?: VisionProviderId;
  chat?: string;
  key: string;
  model: string;
  image?: string | null;
  mime?: 'image/jpeg' | 'image/png';
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text: string; model: string; provider: VisionProviderId; latencyMs: number }>;

/** Node request handler that adds the keys to the allowed upstream calls; a route without its key answers 404. */
export function createKeyProxy(o: {
  apiKey?: string | null;
  agentId?: string | null;
  vision?: { id: VisionProviderId; key: string; chat: string; model: string } | null;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
