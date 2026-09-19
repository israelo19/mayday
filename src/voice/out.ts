// Voice out, docs/04 and docs/07 P3 task 1: ONE speaker queue with priorities, so the app
// has a single mouth and never talks over itself.
//
//   critical    cancels whatever is playing and speaks now — unless what is playing is
//               itself critical: a life-safety line is never chopped by another. A
//               narration line chopped mid-word goes back to the front of its lane, so
//               the instruction is still delivered once the emergency line has played.
//   correction  coalesces by dedupeKey: a newer 'rate-low' replaces the queued one in
//               place, so the rescuer hears the newest version once, not once per frame.
//   narration   the protocol's own instructions. Held until the queue is idle, never
//               discarded — except when the state that asked for them is already gone;
//               a queued line for a state we left would be wrong out loud.
//
// Cooldown: the same dedupeKey is audible at most once per window (default 6000 ms),
// checked when a line is queued AND again when it is about to play. The metronome is
// independent of speech: nothing here pauses it (docs/04).
//
// Owned by P3 (docs/07). The engine decides WHAT to say; this file only decides WHEN a
// decided line becomes audible. No medical text originates here, and per the boundary
// test this file never imports the networked providers — setProvider() injects them.
import type { CoachingEvent } from '../types';
import { chunkForSpeech } from './chunk';

// ---------------------------------------------------------------------------
// Speaker providers
// ---------------------------------------------------------------------------

/**
 * Delivery hints. Prosody only: the words are the engine's and are never modulated here —
 * a repeated correction gets a firmer voice, never a different instruction.
 */
export type SpeakOptions = {
  /** Fires the moment audio actually starts, for fact-to-audible latency (docs/07 P3 task 4). */
  onStart?: () => void;
  /** 0 neutral; 1, 2 = the same dedupeKey repeating recently. Providers raise urgency, not words. */
  insistence?: 0 | 1 | 2;
};

/** Something that can speak one utterance and cancel it. */
export interface SpeakerProvider {
  readonly name: string;
  /** Resolves when the utterance ends or is cancelled. Never rejects: speech failing must never break coaching. */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  cancel(): void;
  /** Called from inside a user gesture; providers that need an autoplay unlock do it here. */
  unlock?(): Promise<void>;
}

/** Web Speech API synthesis. Works offline, needs no keys. The floor everything falls back to. */
export class WebSpeechProvider implements SpeakerProvider {
  readonly name = 'webspeech';
  private voice: SpeechSynthesisVoice | null = null;
  private current: SpeechSynthesisUtterance | null = null;
  /** Bumped on cancel() so an in-flight chunk chain knows to stop (docs/07 P3 task 2). */
  private generation = 0;

  constructor(private readonly rate = 1.05) {
    if (WebSpeechProvider.available()) {
      this.pickVoice();
      // Chrome populates voices asynchronously.
      speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
    }
  }

  static available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  currentVoiceName(): string | null {
    return this.voice?.name ?? null;
  }

  private pickVoice(): void {
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return;
    const score = (v: SpeechSynthesisVoice): number =>
      (v.lang === 'en-US' ? 4 : v.lang.toLowerCase().startsWith('en') ? 2 : 0) +
      (/Google US English|Samantha|Alex|Aria|Jenny/i.test(v.name) ? 2 : 0) +
      (v.localService ? 1 : 0) +
      (v.default ? 0.5 : 0);
    this.voice = [...voices].sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  /** Resolves once getVoices() is populated (Chrome fills it async), or after a short timeout. */
  ready(timeoutMs = 1500): Promise<void> {
    if (!WebSpeechProvider.available()) return Promise.resolve();
    if (speechSynthesis.getVoices().length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, timeoutMs);
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    });
  }

  /**
   * One inaudible utterance from inside the tap, so iOS treats speech as user-initiated for
   * the rest of the session. One tap, never again (docs/07 P3 task 2).
   */
  async unlock(): Promise<void> {
    if (!WebSpeechProvider.available()) return;
    await this.ready();
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  async speak(text: string, opts?: SpeakOptions): Promise<void> {
    if (!WebSpeechProvider.available()) return;
    const gen = ++this.generation;
    // Chrome silently cuts long utterances, so a long line plays as a chain of short ones.
    // The chain reads as one line: onStart fires once, and a cancel() aborts all of it.
    const chunks = chunkForSpeech(text);
    for (let i = 0; i < chunks.length; i++) {
      if (gen !== this.generation) return; // cancelled mid-chain
      await this.speakOne(chunks[i], opts?.insistence ?? 0, i === 0 ? opts?.onStart : undefined);
    }
  }

  private speakOne(text: string, insistence: number, onStart?: () => void): Promise<void> {
    // Only interrupt when something is actually playing: on iOS Safari a cancel() followed
    // immediately by speak() can leave the new utterance silent with no end/error event.
    if (speechSynthesis.speaking || speechSynthesis.pending) this.cancelUtterance();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      // Insistence is urgency through delivery, never wording: a touch faster and lower,
      // full volume. The instruction itself is untouched (CLAUDE.md principle 1).
      u.rate = this.rate * (1 + 0.06 * insistence);
      u.pitch = 1 - 0.05 * insistence;
      u.volume = 1;
      if (this.voice) u.voice = this.voice;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        if (this.current === u) this.current = null;
        resolve();
      };
      // Watchdog: some engines (iOS Safari in particular) occasionally never fire end or
      // error. A promise that never settles would freeze a coaching queue, so resolve after
      // the line's plausible duration instead. Seen on the demo iPhone during M0 (P1).
      const watchdog = window.setTimeout(done, Math.max(4000, text.length * 90 + 1500));
      if (onStart) u.onstart = () => onStart();
      u.onend = done;
      u.onerror = done;
      this.current = u;
      // Chrome can get stuck paused after a cancel(); resume only when it is.
      if (speechSynthesis.paused) speechSynthesis.resume();
      speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    this.generation++;
    this.cancelUtterance();
  }

  private cancelUtterance(): void {
    if (!WebSpeechProvider.available()) return;
    this.current = null;
    speechSynthesis.cancel();
  }
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/** The published P3 -> P4 seam from docs/07. */
export interface VoiceOut {
  /** Call from inside a user gesture (autoplay policy). One tap unlocks the session. */
  unlock(): Promise<void>;
  enqueue(e: CoachingEvent): void;
  startMetronome(bpm: number): void;
  stopMetronome(): void;
  /** True while a line is audible; VoiceIn uses this for echo suppression. */
  isSpeaking(): boolean;
  /** WebSpeech default, ElevenLabs behind a flag. Affects the next line, not the current one. */
  setProvider(p: SpeakerProvider): void;
}

/** Everything beyond the published seam that other src/voice modules need. */
export interface VoiceOutFull extends VoiceOut {
  /**
   * Perception facts pass through so a coaching line can be attributed to the newest fact:
   * `CoachingEvent` on main carries no fact timestamp, so latency (docs/07 P3 task 4) is
   * measured from here. If an event ever carries its own `t`, that wins.
   */
  noteFacts(f: { t: number }): void;
  /** ms since the last utterance ended; 0 while speaking, Infinity before the first line. */
  quietForMs(): number;
  /** The last few spoken texts, for VoiceIn's transcript-vs-own-speech echo gate. */
  recentlySpoken(): readonly string[];
  /** Drop every queued line and stop the current one. State change or session end. */
  cancelAll(): void;
}

/** Structural so tests and future metronome changes don't couple to the class. */
type MetronomeLike = {
  start(bpm?: number): void;
  stop(): void;
  unlock?(): Promise<void>;
  /** Short attention tone before a critical line; optional until the metronome grows one. */
  earcon?(): void;
};

export type VoiceOutOptions = {
  provider: SpeakerProvider;
  metronome?: MetronomeLike;
  /** Injected clock so every queue test runs in node with no real timers. */
  now?: () => number;
  /** Fires the moment a line is audible; latencyMs is null when no fact time is known. */
  onSpoken?: (e: CoachingEvent, latencyMs: number | null) => void;
};

/** Same dedupeKey audible at most once per this window unless the event says otherwise. */
export const DEFAULT_COOLDOWN_MS = 6000;
/** Repeats of the same dedupeKey inside this window raise insistence (delivery, not words). */
export const INSISTENCE_WINDOW_MS = 45000;
/**
 * stateIds with this prefix are voice-internal (SITREP read-aloud, dispatcher turns): they
 * neither count as the protocol's current state nor get dropped as stale when it changes.
 */
export const VOICE_STATE_PREFIX = 'voice:';

type Queued = {
  e: CoachingEvent;
  /** Newest known fact time when this was queued; fact-to-audible latency measures from here. */
  factT: number | null;
};

export function createVoiceOut(opts: VoiceOutOptions): VoiceOutFull {
  let provider = opts.provider;
  const metronome = opts.metronome ?? null;
  const now = opts.now ?? (() => Date.now());

  const lanes: Record<CoachingEvent['priority'], Queued[]> = {
    critical: [],
    correction: [],
    narration: [],
  };
  /** dedupeKey -> when it last became audible. The cooldown gate. */
  const lastAudibleAt = new Map<string, number>();
  /** dedupeKey -> recent audible times, for insistence. */
  const repeatHistory = new Map<string, number[]>();
  /** Last few spoken texts, newest last, for VoiceIn's echo text gate. */
  const recent: string[] = [];

  let current: { q: Queued; token: number } | null = null;
  let token = 0;
  let lastFactT: number | null = null;
  let lastEndedAt: number | null = null;
  /** The protocol state of the newest protocol event; queued narration for any other state is stale. */
  let latestStateId: string | null = null;

  const isVoiceInternal = (e: CoachingEvent): boolean => e.stateId.startsWith(VOICE_STATE_PREFIX);

  const cooldownOf = (e: CoachingEvent): number =>
    (e as { cooldownMs?: number }).cooldownMs ?? DEFAULT_COOLDOWN_MS;

  const onCooldown = (e: CoachingEvent): boolean => {
    if (!e.dedupeKey) return false;
    const last = lastAudibleAt.get(e.dedupeKey);
    return last !== undefined && now() - last < cooldownOf(e);
  };

  const stale = (q: Queued): boolean =>
    !isVoiceInternal(q.e) && latestStateId !== null && q.e.stateId !== latestStateId;

  const insistenceOf = (e: CoachingEvent): 0 | 1 | 2 => {
    if (!e.dedupeKey) return 0;
    const cutoff = now() - INSISTENCE_WINDOW_MS;
    const repeats = (repeatHistory.get(e.dedupeKey) ?? []).filter((t) => t >= cutoff).length;
    return repeats >= 2 ? 2 : repeats === 1 ? 1 : 0;
  };

  /** Bookkeeping for the moment a line becomes audible. */
  const markAudible = (q: Queued, at: number): void => {
    if (q.e.dedupeKey) {
      lastAudibleAt.set(q.e.dedupeKey, at);
      const hist = repeatHistory.get(q.e.dedupeKey) ?? [];
      hist.push(at);
      while (hist.length > 8) hist.shift();
      repeatHistory.set(q.e.dedupeKey, hist);
    }
    recent.push(q.e.text);
    while (recent.length > 6) recent.shift();
    opts.onSpoken?.(q.e, q.factT !== null ? at - q.factT : null);
  };

  /** Stop the current utterance so a higher line can play; the continuation goes dead. */
  const preemptCurrent = (): void => {
    if (!current) return;
    const preempted = current.q;
    current = null;
    provider.cancel();
    // A chopped instruction was not delivered: narration goes back to the front of its lane
    // to replay when idle. Corrections are disposable — the engine re-emits them while the
    // condition holds — and a critical never gets here.
    if (preempted.e.priority === 'narration' && !stale(preempted)) lanes.narration.unshift(preempted);
  };

  const nextItem = (): Queued | null => {
    lanes.narration = lanes.narration.filter((q) => !stale(q));
    return lanes.critical.shift() ?? lanes.correction.shift() ?? lanes.narration.shift() ?? null;
  };

  const pump = (): void => {
    if (current) return;
    const q = nextItem();
    if (q === null) return;
    // Re-check at play time: the key may have become audible via another lane while this
    // sat queued, and "at most once per window" means audible, not queued.
    if (onCooldown(q.e)) {
      pump();
      return;
    }
    const myToken = ++token;
    current = { q, token: myToken };
    // A short non-verbal tone before a critical line captures attention before the words
    // start; under stress the first word otherwise goes unheard.
    if (q.e.priority === 'critical') metronome?.earcon?.();
    let startedAt: number | null = null;
    void provider
      .speak(q.e.text, {
        insistence: insistenceOf(q.e),
        onStart: () => {
          if (current?.token !== myToken) return; // preempted before audio started
          startedAt = now();
          markAudible(q, startedAt);
        },
      })
      .then(() => {
        if (current?.token !== myToken) return; // preempted; the preemptor owns the queue now
        // Provider never reported a start (some engines have no start event): count the
        // line as audible at completion so cooldowns still hold and nags never machine-gun.
        if (startedAt === null) markAudible(q, now());
        current = null;
        lastEndedAt = now();
        pump();
      });
  };

  return {
    async unlock(): Promise<void> {
      await metronome?.unlock?.();
      await provider.unlock?.();
    },

    enqueue(e: CoachingEvent): void {
      // Every protocol event names the state it came from, so the newest one is the current
      // state; queued narration for any other state is stale and will be dropped unplayed.
      if (!isVoiceInternal(e)) latestStateId = e.stateId;
      if (onCooldown(e)) return;
      const q: Queued = { e, factT: (e as { t?: number }).t ?? lastFactT };
      if (e.priority === 'critical') {
        lanes.critical.push(q);
        if (current && current.q.e.priority !== 'critical') preemptCurrent();
      } else if (e.priority === 'correction') {
        const i = e.dedupeKey ? lanes.correction.findIndex((x) => x.e.dedupeKey === e.dedupeKey) : -1;
        if (i >= 0) lanes.correction[i] = q; // newer replaces queued, position kept
        else lanes.correction.push(q);
      } else {
        lanes.narration.push(q);
      }
      pump();
    },

    startMetronome(bpm: number): void {
      metronome?.start(bpm);
    },

    stopMetronome(): void {
      metronome?.stop();
    },

    isSpeaking(): boolean {
      return current !== null;
    },

    setProvider(p: SpeakerProvider): void {
      provider = p;
    },

    noteFacts(f: { t: number }): void {
      lastFactT = f.t;
    },

    quietForMs(): number {
      if (current !== null) return 0;
      return lastEndedAt === null ? Number.POSITIVE_INFINITY : now() - lastEndedAt;
    },

    recentlySpoken(): readonly string[] {
      return recent;
    },

    cancelAll(): void {
      lanes.critical = [];
      lanes.correction = [];
      lanes.narration = [];
      if (current) {
        current = null;
        provider.cancel();
        lastEndedAt = now();
      }
    },
  };
}
