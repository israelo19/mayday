// Types for devproxy.mjs so vite.config.ts can import it under `strict`. The module stays
// plain JavaScript on purpose: it is a Node script that also runs standalone (see its header).
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Value of `name` from the environment, else from .env.local, else null. */
export function readLocalEnv(name: string): string | null;

/** Node request handler that adds the key to the allowed ElevenLabs calls. */
export function createKeyProxy(o: {
  apiKey: string;
  agentId?: string | null;
  /** ELEVENLABS_COACH_VOICE: a voice id or a name in the account's library; null keeps the default. */
  coachVoice?: string | null;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
