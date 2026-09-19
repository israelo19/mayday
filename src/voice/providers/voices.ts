// The ElevenLabs voices (docs/04 item 2, docs/09). The defaults are premade voices present in
// every account, chosen in code so every laptop and the deploy speak the same way out of the
// box. The coach voice is configurable where the key is, not in the app: the key proxy reads
// ELEVENLABS_COACH_VOICE from .env.local, resolves it against the account's library, and
// `fetchCoachVoice` asks the proxy once at startup. The app itself shows no voice setting
// (docs/05: one button, no navigation). The dispatcher voice stays fixed: it is a second
// character on stage, not a preference. Owned by P3 (docs/07).

/** A voice the coach can speak with: the id ElevenLabs needs and the name people see. */
export type VoiceChoice = { voiceId: string; voiceName: string };

/** Coach: "Brian - Deep, Resonant and Comforting". Calm, low, authoritative, as docs/04 asks. */
export const COACH_VOICE_ID = 'nPczCjzI2devNBz1zQrb';
export const COACH_VOICE_NAME = 'Brian';
export const DEFAULT_COACH_VOICE: VoiceChoice = { voiceId: COACH_VOICE_ID, voiceName: COACH_VOICE_NAME };

/** Dispatcher: "Sarah - Mature, Reassuring, Confident". Clearly a second person on stage. */
export const DISPATCHER_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
export const DISPATCHER_VOICE_NAME = 'Sarah';

export type FetchCoachVoiceOptions = {
  /** The key proxy base, same default as the provider. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
  /** The startup budget; past it the default voice simply stays. */
  timeoutMs?: number;
};

/**
 * The coach voice the proxy is configured with (`GET /voice`), or null when nothing is set,
 * nothing matched, or the proxy is unreachable. Never throws: a missing answer means the
 * default voice keeps coaching, which is the always-correct outcome.
 */
export async function fetchCoachVoice(o: FetchCoachVoiceOptions = {}): Promise<VoiceChoice | null> {
  const fetchFn = o.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 2000);
  try {
    const res = await fetchFn(`${o.baseUrl ?? '/api/proxy'}/voice`, { method: 'GET', signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { coach?: unknown };
    return isChoice(body.coach) ? { voiceId: body.coach.voiceId, voiceName: body.coach.voiceName } : null;
  } catch {
    return null; // timeout, network, bad JSON: all mean "keep the default"
  } finally {
    clearTimeout(timer);
  }
}

function isChoice(v: unknown): v is VoiceChoice {
  if (typeof v !== 'object' || v === null) return false;
  const { voiceId, voiceName } = v as Record<string, unknown>;
  return typeof voiceId === 'string' && voiceId.length > 0 && typeof voiceName === 'string' && voiceName.length > 0;
}
