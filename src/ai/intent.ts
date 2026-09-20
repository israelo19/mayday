// Intent to keyword: one sentence no keyword matched, to one of the moves the engine is
// ALREADY offering (docs/04 item 8). A panicking bystander does not say "not breathing", they
// say "he's just lying there and won't wake up"; src/protocol's phrase cues catch some of
// that and this catches the rest. Owned by P4 (docs/07).
//
// Principle 1 holds structurally, not by trusting the model: the session hands over the
// buttons that are on the screen right now, the model answers with the NUMBER of one of them,
// and `parseIntent` returns the option object the engine itself minted. A number outside the
// list, a keyword typed out in prose, an invented step: all of it is null, and null means the
// app does exactly what it does with no model at all. The human still says yes before anything
// moves. Episodic (principle 3): one call, only after the local matcher and the phrase cues
// have both missed, never on the perception -> engine -> voice path.
// The provider and its key live in the proxy (src/voice/providers/devproxy.mjs).

export const INTENT_TIMEOUT_MS = 3000;
export const DEFAULT_INTENT_ENDPOINT = '/api/proxy/intent/route';

/**
 * One move the engine is offering: the label on the button, and the keyword that presses it.
 * Or, with `kind: 'answer'`, a question the machine has an approved answer for, labelled as a
 * person would ask it; the session speaks that answer without asking, since nothing moves.
 */
export type IntentOption = { keyword: string; label: string; kind?: 'transition' | 'answer' };

export type IntentRequest = { transcript: string; options: readonly IntentOption[] };

/** An option the model picked, echoed back from the list, never from the model's own text. */
export type IntentMatch = IntentOption & { confidence: 'medium' | 'high'; model: string; latencyMs: number };

export interface IntentRouter {
  /** Null on any miss: timeout, no match, low confidence, bad JSON, no key. The app then does nothing. */
  route(req: IntentRequest): Promise<IntentMatch | null>;
}

export const INTENT_SYSTEM =
  'You are reading one sentence from a panicking bystander at a medical emergency and deciding which of a fixed list of options it means. Some options are things the bystander may be reporting; those marked Question are questions the bystander may be asking. You never give advice, instructions or a diagnosis, and you never suggest anything outside the list.';

/**
 * The list is numbered from 1 so that 0, the default of a confused model, means "none".
 *
 * Abstaining and being unsure are asked for separately on purpose. An earlier draft said
 * "pick 0 rather than guess" AND had the parser drop low confidence, and two abstention
 * mechanisms stacked made Gemini answer 0 to "the poor man went down in the hallway and he is
 * grey", which is the exact sentence this feature exists to catch. So 0 now means only "not
 * about any of these", doubt goes in `confidence`, and `parseIntent` is the single gate.
 */
export function intentPrompt(transcript: string, options: readonly IntentOption[]): string {
  return [
    'Options:',
    ...options.map((o, i) => `${i + 1}. ${o.kind === 'answer' ? 'Question: ' : ''}${o.label}`),
    '',
    `The bystander said: "${transcript}"`,
    '',
    'Answer with one JSON object and nothing else, with exactly these keys:',
    '"choice": the number of the option the sentence is describing, or 0 if the sentence is not about any of them.',
    '"confidence": "low", "medium" or "high". Use "low" if the sentence could just as easily be another option.',
    'No advice, no explanation, no extra keys.',
  ].join('\n');
}

/** The first JSON object in a model reply, tolerant of code fences and prose around it. */
function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Never throws, and never returns anything the caller did not offer. A low confidence is a
 * miss too: an unsure question is worse than silence while someone is counting compressions.
 */
export function parseIntent(
  text: string,
  options: readonly IntentOption[],
  meta: { model: string; latencyMs: number },
): IntentMatch | null {
  const obj = extractJson(text);
  if (!obj) return null;
  const choice = typeof obj.choice === 'number' ? obj.choice : Number.NaN;
  if (!Number.isInteger(choice) || choice < 1 || choice > options.length) return null;
  const confidence = typeof obj.confidence === 'string' ? obj.confidence.trim().toLowerCase() : '';
  if (confidence !== 'medium' && confidence !== 'high') return null;
  return { ...options[choice - 1], confidence, model: meta.model, latencyMs: meta.latencyMs };
}

export type IntentRouterOptions = {
  /** The proxy route. Same origin as the page, so the phone reaches it over its own https URL. */
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

/** The real thing: one POST to the proxy, which holds the key and picks the model. */
export function createIntentRouter(opts: IntentRouterOptions = {}): IntentRouter {
  const endpoint = opts.endpoint ?? DEFAULT_INTENT_ENDPOINT;
  const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : null);
  const timeoutMs = opts.timeoutMs ?? INTENT_TIMEOUT_MS;
  const now = opts.now ?? (() => Date.now());
  return {
    async route(req) {
      if (!doFetch || req.options.length === 0 || req.transcript.trim() === '') return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = now();
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ system: INTENT_SYSTEM, user: intentPrompt(req.transcript, req.options), maxTokens: 128 }),
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { text?: unknown; model?: unknown };
        if (typeof json.text !== 'string') return null;
        const model = typeof json.model === 'string' ? json.model : 'unknown';
        return parseIntent(json.text, req.options, { model, latencyMs: now() - started });
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The `?fake=1` stand-in: the option whose label shares the most words with what was said,
 * after a short wait. Enough to walk the flow with no key, and deliberately dumber than the
 * model so nobody mistakes one for the other.
 */
export function createStubIntentRouter(delayMs = 700): IntentRouter {
  const words = (s: string): string[] => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  return {
    async route(req) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const said = new Set(words(req.transcript));
      let best: { option: IntentOption; score: number } | null = null;
      for (const option of req.options) {
        const score = words(option.label).filter((w) => said.has(w)).length;
        if (score > 0 && (!best || score > best.score)) best = { option, score };
      }
      return best ? { ...best.option, confidence: 'medium', model: 'stub', latencyMs: delayMs } : null;
    },
  };
}
