// Types for devproxy.mjs so vite.config.ts and tests/devproxy.test.ts can import it under
// `strict`. The module stays plain JavaScript on purpose: it is a Node script that also runs
// standalone (see its header).
import type { IncomingMessage, ServerResponse } from 'node:http';

/** The values in one .env file, by name: BOM, `export `, quotes and trailing comments handled. */
export function parseEnv(text: string): Map<string, string>;

/** Where `name` is set and what it holds, or null; `dir` is where .env.local and .env live (the repo root by default). */
export function findLocalEnv(name: string, dir?: string | URL): { value: string; source: 'environment' | '.env.local' | '.env' } | null;

/** Value of `name` from the environment, else from .env.local, else .env in `dir`, else null. */
export function readLocalEnv(name: string, dir?: string | URL): string | null;

/** One line for the startup log: where each named key came from, never what it is. */
export function keySources(names: readonly string[], dir?: string | URL): string;

/** The coach and dispatcher voice ids, mirrors of src/voice/providers/voices.ts; the TTS route accepts no others. */
export const COACH_VOICE_ID: string;
export const DISPATCHER_VOICE_ID: string;

/** Requests one address may make in a sliding minute before the proxy answers 429. */
export const DEFAULT_RATE_PER_MINUTE: number;

export type ProviderId = 'gemini' | 'featherless' | 'xai';

/** The model providers, keyed by id: endpoint, which env vars name the key and model, and whether a frame may go there. */
export const MODEL_PROVIDERS: Record<
  ProviderId,
  { chat: string; keyEnv: string; modelEnv: string; defaultModel: string; body?: Record<string, unknown>; vision?: boolean }
>;

/**
 * The provider tried first when MODEL_PROVIDER is unset: the pick order is the named
 * provider, then this one, then featherless, then xai. The frame route skips xai.
 */
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
  fetchFn?: typeof fetch;
}): Promise<{ text: string; model: string; provider: ProviderId; latencyMs: number }>;

/** The raw body, undefined when empty, or null once it ran past `limit` bytes (answer with sendTooLarge). */
export function readBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined | null>;

/** A 413 with connection: close; the socket is destroyed once the answer has left. */
export function sendTooLarge(req: IncomingMessage, res: ServerResponse): void;

/**
 * Node request handler that adds the keys to the allowed upstream calls; a route without its
 * key answers 404. Every request first meets the origin gate (403) and the rate limit (429).
 */
export function createKeyProxy(o: {
  apiKey?: string | null;
  agentId?: string | null;
  /** ELEVENLABS_COACH_VOICE: a voice id or a name in the account's library; null keeps the default. */
  coachVoice?: string | null;
  provider?: { id: ProviderId; key: string; chat: string; model: string } | null;
  /** Serves /vision/assess. Defaults to `provider`; differs when the text model has no vision. */
  visionProvider?: { id: ProviderId; key: string; chat: string; model: string } | null;
  /** Requests one address may make per minute; DEFAULT_RATE_PER_MINUTE unless a test lowers it. */
  ratePerMinute?: number;
  /** Test seam: the upstream. */
  fetchFn?: typeof fetch;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
