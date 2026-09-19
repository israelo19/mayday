// Types for devproxy.mjs so vite.config.ts can import it under `strict`. The module stays
// plain JavaScript on purpose: it is a Node script that also runs standalone (see its header).
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Value of `name` from the environment, else from .env.local, else null. */
export function readLocalEnv(name: string): string | null;

/** The vision model the proxy uses when FEATHERLESS_VISION_MODEL is unset. */
export const DEFAULT_VISION_MODEL: string;

/** One frame and the app's question to a Featherless vision model; the raw reply text comes back. */
export function assessWithFeatherless(o: {
  key: string;
  model: string;
  image: string;
  mime?: 'image/jpeg' | 'image/png';
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text: string; model: string; provider: 'featherless'; latencyMs: number }>;

/** Node request handler that adds the keys to the allowed upstream calls; a route without its key answers 404. */
export function createKeyProxy(o: {
  apiKey?: string | null;
  agentId?: string | null;
  visionKey?: string | null;
  visionModel?: string;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
