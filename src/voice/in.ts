// Voice in, docs/04 and docs/07 P3 task 3: keyword spotting ONLY. The transcript is data
// on its way to a deterministic keyword table; no free text ever reaches an authority path
// (CLAUDE.md threat model row 1). Chrome-only reality: SpeechRecognition is feature-detected
// and every voice transition has a button twin, so the demo never depends on this file.
//
// The M2 gate lives here: a keyword spoken by a HUMAN routes, and the same words spoken by
// the app's own speaker do not. Two independent echo layers, because on a phone propped by
// a patient the mic will certainly hear the app:
//   1. time gate  - results are ignored while the app speaks and for a tail after (the
//      caller's suppress() closure, wired to the queue's isSpeaking/quietForMs).
//   2. text gate  - a transcript that reads back one of the app's own recent lines nearly
//      verbatim is an echo the time gate missed (recognition results can arrive seconds
//      late). Short fragments never trip it: a human answering "not breathing" right after
//      the app SAID "breathing" must still route.
//
// NOTE for the pitch, not this file: Chrome's SpeechRecognition streams audio to Google's
// servers. Voice INPUT needs network; coaching and voice output stay local. Say it that way.
// Owned by P3 (docs/07).

/** Refuse to fire the same keyword twice inside this window (interim + final overlap). */
export const KEYWORD_REFIRE_MS = 1500;
/** Layer 2 only ever drops near-verbatim readbacks, never short answers. */
const ECHO_MIN_WORDS = 4;
const ECHO_COVERAGE = 0.8;

// ---------------------------------------------------------------------------
// Pure parts, exported for tests
// ---------------------------------------------------------------------------

/** Lowercase, straight apostrophes, punctuation to spaces: ready for word-bounded matching. */
export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phrase-level, word-bounded, longest match first — so "he's not breathing" resolves to
 * 'not breathing' and never to 'no' (docs/07 first-hour decision 4). Returns the keyword
 * exactly as the caller listed it, or null.
 */
export function spotKeyword(transcript: string, keywords: readonly string[]): string | null {
  const padded = ` ${normalizeTranscript(transcript)} `;
  const byLength = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of byLength) {
    const normalized = normalizeTranscript(keyword);
    if (normalized.length > 0 && padded.includes(` ${normalized} `)) return keyword;
  }
  return null;
}

/**
 * True when the transcript is a near-verbatim, in-order readback of one of the app's own
 * recent lines. Four words minimum: a bystander's short answer is never treated as an echo.
 */
export function isEchoOf(transcript: string, spoken: readonly string[]): boolean {
  const words = normalizeTranscript(transcript).split(' ').filter(Boolean);
  if (words.length < ECHO_MIN_WORDS) return false;
  for (const line of spoken) {
    const lineWords = normalizeTranscript(line).split(' ').filter(Boolean);
    let searchFrom = 0;
    let matched = 0;
    for (const word of words) {
      const at = lineWords.indexOf(word, searchFrom);
      if (at >= 0) {
        matched++;
        searchFrom = at + 1;
      }
    }
    if (matched / words.length >= ECHO_COVERAGE) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The listener
// ---------------------------------------------------------------------------

/** The slice of SpeechRecognition this file uses; structural so tests can fake it. */
export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
};
export type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript: string } }>;
};

export type VoiceInStatus = 'listening' | 'restarting' | 'unavailable' | 'stopped';

/** The published P3 -> P4 seam from docs/07, plus the layer-2 echo source and a status lamp. */
export type VoiceInOptions = {
  /** The active state's keyword list plus globals; read fresh on every result. */
  keywords: () => readonly string[];
  onKeyword: (k: string) => void;
  /** Final transcripts, for the event log as kind 'user' (they enrich the handoff report). */
  onTranscript: (t: string) => void;
  /** Layer 1: true while the app itself is speaking (plus the quiet tail). */
  suppress: () => boolean;
  /** Layer 2: the app's recent lines, from the queue's recentlySpoken(). */
  echoText?: () => readonly string[];
  /** For the debug panel; hide voice affordances on 'unavailable'. */
  onStatus?: (s: VoiceInStatus) => void;
};

export interface VoiceIn {
  readonly available: boolean;
  start(o: VoiceInOptions): void;
  stop(): void;
}

type VoiceInDeps = {
  /** Test seam; the default finds window.SpeechRecognition or the webkit prefix. */
  factory?: () => SpeechRecognitionLike;
  now?: () => number;
  /** Returns a cancel function. Injected so restart backoff is testable without timers. */
  schedule?: (fn: () => void, ms: number) => () => void;
};

function defaultFactory(): (() => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? () => new Ctor() : null;
}

export function createVoiceIn(deps?: VoiceInDeps): VoiceIn {
  const factory = deps?.factory ?? defaultFactory();
  const now = deps?.now ?? (() => Date.now());
  const schedule =
    deps?.schedule ??
    ((fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    });

  let rec: SpeechRecognitionLike | null = null;
  let opts: VoiceInOptions | null = null;
  let running = false;
  let backoffMs = 250;
  let cancelRestart: (() => void) | null = null;
  const firedAt = new Map<string, number>();

  const status = (s: VoiceInStatus) => opts?.onStatus?.(s);

  function attach(): void {
    if (!factory || !opts) return;
    const o = opts;
    const r = factory();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      backoffMs = 250; // hearing anything at all means the engine is healthy again
      if (o.suppress()) return; // layer 1: the app is talking, or just was
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const raw = result[0]?.transcript ?? '';
        if (raw.trim().length === 0) continue;
        if (isEchoOf(raw, o.echoText?.() ?? [])) continue; // layer 2: our own line, read back
        if (result.isFinal) o.onTranscript(raw.trim());
        // Interim results are spotted too — routing must not wait for the final — and the
        // refire window keeps the final from firing the same keyword again.
        const keyword = spotKeyword(raw, o.keywords());
        if (keyword !== null && now() - (firedAt.get(keyword) ?? Number.NEGATIVE_INFINITY) > KEYWORD_REFIRE_MS) {
          firedAt.set(keyword, now());
          o.onKeyword(keyword);
        }
      }
    };
    r.onerror = (e) => {
      // Permission is gone for the session: stop retrying and let the buttons carry it.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        running = false;
        status('unavailable');
      }
      // Everything else ('no-speech', 'network', 'aborted') falls through to onend, which
      // restarts with backoff.
    };
    r.onend = () => {
      // Chrome ends continuous sessions on its own schedule; treat every end as a restart
      // request while we are supposed to be listening.
      if (!running) {
        status('stopped');
        return;
      }
      status('restarting');
      cancelRestart = schedule(() => {
        cancelRestart = null;
        if (!running) return;
        attach();
        status('listening');
      }, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 4000); // reset on the next result
    };
    rec = r;
    try {
      r.start();
    } catch {
      // start() throws if a previous instance is still winding down; the backoff retries.
    }
  }

  return {
    available: factory !== null,

    start(o: VoiceInOptions): void {
      opts = o;
      if (!factory) {
        status('unavailable');
        return;
      }
      if (running) return;
      running = true;
      backoffMs = 250;
      attach();
      status('listening');
    },

    stop(): void {
      running = false;
      cancelRestart?.();
      cancelRestart = null;
      rec?.stop();
      rec = null;
      status('stopped');
    },
  };
}
