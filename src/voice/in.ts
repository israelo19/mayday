// Voice in, docs/04 and docs/07 P3 task 3: keyword spotting ONLY. The transcript is data
// on its way to a deterministic keyword table; no free text ever reaches an authority path
// (CLAUDE.md threat model row 1). Chrome-only reality: SpeechRecognition is feature-detected
// and every voice transition has a button twin, so the demo never depends on this file.
//
// The M2 gate lives here: a keyword spoken by a HUMAN routes, and the same words spoken by
// the app's own speaker do not. Two independent echo layers, because on a phone propped by
// a patient the mic will certainly hear the app:
//   1. time gate  - while the app speaks and for a tail after (the caller's suppress()
//      closure, wired to the queue's isSpeaking/quietForMs), a keyword the app itself just
//      said is held back and nothing from that stretch is logged; a keyword the app did not
//      say still routes, because the app's own words are the only echo the mic can hear, and
//      a person talking over the coach is the normal case on a phone.
//   2. text gate  - a transcript that reads back one of the app's own recent lines nearly
//      verbatim is an echo the time gate missed (recognition results can arrive seconds
//      late). Short fragments never trip it: a human answering "not breathing" right after
//      the app SAID "breathing" must still route.
//
// WebKit (iOS and macOS Safari) in continuous mode sends interim results only, each one the
// whole utterance so far, and no final until the session stops; Chrome sends finals itself.
// So an interim that stops changing for INTERIM_SETTLE_MS is treated as the sentence, and a
// keyword fires once per occurrence, judged against the words that were already there.
//
// NOTE for the pitch, not this file: Chrome's SpeechRecognition streams audio to Google's
// servers. Voice INPUT needs network; coaching and voice output stay local. Say it that way.
// Owned by P3 (docs/07).

/** Refuse to fire the same keyword twice inside this window (interim + final overlap). */
export const KEYWORD_REFIRE_MS = 1500;
/** An interim result unchanged for this long is the sentence (WebKit never sends the final). */
export const INTERIM_SETTLE_MS = 1200;
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
  /** The remaining recognizer events, wired only for diagnostics (VoiceInOptions.onEvent). */
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onaudioend?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onnomatch?: (() => void) | null;
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
  /** What is being heard while the person still speaks, for the screen only; never logged, never routed here. */
  onInterim?: (t: string) => void;
  /** Layer 1: true while the app itself is speaking (plus the quiet tail). */
  suppress: () => boolean;
  /** Layer 2: the app's recent lines, from the queue's recentlySpoken(). */
  echoText?: () => readonly string[];
  /** For the debug panel; hide voice affordances on 'unavailable'. */
  onStatus?: (s: VoiceInStatus) => void;
  /** The recognizer's error code ('not-allowed', 'network', ...), so a screen can say why the mic is off. */
  onError?: (code: string) => void;
  /** Keyword matcher; defaults to spotKeyword. The session passes the protocol's stemmed, typo-tolerant one. */
  spot?: (transcript: string, keywords: readonly string[]) => string | null;
  /**
   * Diagnostics only: every recognizer event by name ('start', 'audiostart', 'result',
   * 'error', 'end', ...), plus 'suppressed' and 'echo' for results the two gates dropped.
   * Never routes anything; a phone trace is the only consumer (web/trace.ts).
   */
  onEvent?: (name: string, detail?: string) => void;
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

/** Where the last three words of `text` begin, so a phrase split across a refresh is still seen whole. */
function tailStart(text: string, words = 3): number {
  let idx = text.length;
  for (let n = 0; n < words; n++) {
    const sp = text.lastIndexOf(' ', idx - 1);
    if (sp < 0) return 0;
    idx = sp;
  }
  return idx + 1;
}

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

  /**
   * Cut every handler off an instance we are giving up on. Its `end` still arrives, later and
   * on its own task, and an attached `onend` would read the live `running` flag and attach a
   * replacement we never asked for.
   */
  function detach(r: SpeechRecognitionLike | null): void {
    if (!r) return;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    r.onstart = null;
    r.onaudiostart = null;
    r.onaudioend = null;
    r.onsoundstart = null;
    r.onspeechstart = null;
    r.onspeechend = null;
    r.onnomatch = null;
  }

  function attach(): void {
    if (!factory || !opts) return;
    const o = opts;
    const r = factory();
    const ev = o.onEvent;
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 1;
    if (ev) {
      r.onstart = () => ev('start');
      r.onaudiostart = () => ev('audiostart');
      r.onaudioend = () => ev('audioend');
      r.onsoundstart = () => ev('soundstart');
      r.onspeechstart = () => ev('speechstart');
      r.onspeechend = () => ev('speechend');
      r.onnomatch = () => ev('nomatch');
    }
    // The transcript each result index last showed, so a refresh of a growing transcript is
    // told apart from a new sentence; and the interim waiting to become the sentence.
    const prevByIndex = new Map<number, string>();
    let settle: { cancel: () => void; text: string } | null = null;
    let settledText: string | null = null;
    const flushSettle = (): void => {
      if (!settle) return;
      const { text } = settle;
      settle = null;
      settledText = text;
      o.onTranscript(text);
    };
    const armSettle = (text: string): void => {
      settle?.cancel();
      const cancel = schedule(() => {
        if (settle?.text === text) flushSettle();
      }, INTERIM_SETTLE_MS);
      settle = { cancel, text };
    };
    const spot = o.spot ?? spotKeyword;
    /** The app said this keyword in one of its recent lines, so hearing it now may be our own voice. */
    const saidByApp = (keyword: string): boolean => (o.echoText?.() ?? []).some((line) => spot(line, [keyword]) === keyword);
    r.onresult = (e) => {
      backoffMs = 250; // hearing anything at all means the engine is healthy again
      const muted = o.suppress(); // layer 1: the app is talking, or just was
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = (result[0]?.transcript ?? '').trim();
        if (text.length === 0) continue;
        ev?.(result.isFinal ? 'final' : 'interim', text);
        if (isEchoOf(text, o.echoText?.() ?? [])) {
          ev?.('echo', text);
          continue; // layer 2: our own line, read back
        }
        if (muted) {
          // Shown, so the person sees they are heard, but never logged: an echo of our own
          // prompt must not become a "sounds like" suggestion.
          o.onInterim?.(text);
        } else if (result.isFinal) {
          settle?.cancel();
          settle = null;
          if (settledText !== text) o.onTranscript(text); // the settle already logged this one
          settledText = null;
        } else {
          o.onInterim?.(text);
          armSettle(text);
        }
        // Interim results are spotted too: routing must not wait for a final that WebKit never
        // sends. A keyword fires once per occurrence: when the transcript only grew, the words
        // already there are looked at again only where a phrase could straddle the join.
        const prev = prevByIndex.get(i) ?? '';
        const grew = prev.length > 0 && text.startsWith(prev);
        const from = grew ? tailStart(prev) : 0;
        const keyword = spot(text.slice(from), o.keywords());
        const already = keyword !== null && grew && spot(prev.slice(from), o.keywords()) === keyword;
        if (keyword !== null && !already && muted && saidByApp(keyword)) {
          ev?.('suppressed', keyword);
          continue; // judged again once the app is quiet; the baseline stays where it was
        }
        if (result.isFinal) prevByIndex.delete(i);
        else prevByIndex.set(i, text);
        if (keyword === null || already) continue;
        if (now() - (firedAt.get(keyword) ?? Number.NEGATIVE_INFINITY) > KEYWORD_REFIRE_MS) {
          firedAt.set(keyword, now());
          o.onKeyword(keyword);
        }
      }
    };
    r.onerror = (e) => {
      ev?.('error', e.error ?? 'unknown');
      o.onError?.(e.error ?? 'unknown');
      // Permission is gone for the session: stop retrying and let the buttons carry it.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        running = false;
        status('unavailable');
      }
      // Everything else ('no-speech', 'network', 'aborted') falls through to onend, which
      // restarts with backoff.
    };
    r.onend = () => {
      ev?.('end');
      flushSettle(); // a sentence still settling is not lost with the session
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
    // A restart that races a still-open instance would otherwise leave two live recognizers.
    detach(rec);
    rec?.stop();
    rec = r;
    try {
      ev?.('starting');
      r.start();
    } catch (err) {
      // start() throws if a previous instance is still winding down; the backoff retries.
      ev?.('start-threw', String(err));
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
      // Detach before stopping. A real recognizer's `end` arrives on a later task, and
      // restart() puts `running` back to true in the same tick, so the abandoned instance's
      // onend saw a live session and attached a *second* recognizer alongside the new one.
      // Every take after the first then heard the room twice.
      detach(rec);
      rec?.stop();
      rec = null;
      status('stopped');
    },
  };
}
