// ElevenLabs TTS provider, docs/04 TODO item 2 and docs/07 P3 task 8. Lives under
// src/voice/providers/ because this is the ONE place in the reflex path allowed to touch
// the network (src/voice/boundaries.test.ts): the default provider is local and every line
// here falls back to it, so the wifi-off demo never depends on this file.
//
// Shape of the deal:
//   - Requests go to a key proxy (P4's /api/proxy in production, devproxy.mjs locally).
//     The xi-api-key header is added THERE; no key ever reaches this bundle (docs/01
//     threat model: API key theft from the demo QR).
//   - eleven_flash_v2_5: the low-latency model, and half-price credits per character.
//   - No audio within the budget (800 ms default) -> that line speaks on the fallback,
//     and after a few consecutive misses the session stops trying until a warm() works.
//   - Synthesized lines are cached by (voice, model, text). The canonical lines are a
//     small fixed set, so a correction said twenty times costs ONE synthesis, rehearsals
//     stop burning credits, and a warmed cache keeps this voice working with wifi off.
//
// Owned by P3 (docs/07).
import type { SpeakerProvider, SpeakOptions } from '../out';

/** Decodes bytes and plays them; injectable so every test runs in node without WebAudio. */
export type AudioPlayer = {
  decode(bytes: ArrayBuffer): Promise<unknown>;
  play(
    decoded: unknown,
    o: { rate: number; onStart: () => void },
  ): { done: Promise<void>; stop(): void };
  /** Called from inside a user gesture so later, fetch-triggered playback is not muted. */
  unlock?(): Promise<void>;
};

export type ElevenLabsOptions = {
  /** The coach voice. Pick ONE warm authoritative voice in the dashboard (docs/04). */
  voiceId: string;
  /** Shown by the debug panel; defaults to the id, which is what tests assert on. */
  voiceName?: string;
  /** Optional second voice for the simulated dispatcher; without it those lines fall back. */
  dispatcherVoiceId?: string;
  /** The key proxy base. Same-origin in production so nothing here knows about keys. */
  baseUrl?: string;
  modelId?: string;
  outputFormat?: string;
  /** Spoken instead whenever this provider cannot deliver audio in time. Required. */
  fallback: SpeakerProvider;
  /** Budget from speak() to audible audio before that line falls back. */
  firstAudioTimeoutMs?: number;
  /** This many misses in a row and the session stops trying until a warm() succeeds. */
  maxConsecutiveFailures?: number;
  /** While unhealthy, one line per this interval still tries the network, so a wifi that came back is noticed. */
  retryIntervalMs?: number;
  /** Test seams. */
  fetchFn?: typeof fetch;
  player?: AudioPlayer;
  now?: () => number;
};

const DEFAULTS = {
  baseUrl: '/api/proxy',
  modelId: 'eleven_flash_v2_5',
  outputFormat: 'mp3_22050_32', // codec_samplerate_bitrate; plenty for a phone speaker
  firstAudioTimeoutMs: 800,
  maxConsecutiveFailures: 3,
  retryIntervalMs: 30_000,
} as const;

/**
 * Playback that never ends is treated as playback that failed: an AudioContext that another
 * app silenced (a phone call, audio focus taken) never fires onended, and the line's promise
 * would otherwise hang the whole queue. The budget is the audio's own length plus this slack.
 */
const PLAYBACK_SLACK_MS = 1500;
/** When the decoded audio does not say how long it is, assume a slow coaching pace. */
const MS_PER_CHAR = 90;

/** Web Audio playback with its own lazy context; kept out of the class for testability. */
function webAudioPlayer(): AudioPlayer {
  let ctx: AudioContext | null = null;
  const ensure = () => (ctx ??= new AudioContext());
  return {
    async unlock(): Promise<void> {
      await ensure().resume();
    },
    async decode(bytes: ArrayBuffer): Promise<unknown> {
      // slice(): decodeAudioData detaches its input on some engines; the cache keeps ours.
      return ensure().decodeAudioData(bytes.slice(0));
    },
    play(decoded, o) {
      const audioCtx = ensure();
      void audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = decoded as AudioBuffer;
      source.playbackRate.value = o.rate;
      source.connect(audioCtx.destination);
      let finish!: () => void;
      const done = new Promise<void>((resolve) => (finish = resolve));
      source.onended = () => finish();
      o.onStart();
      source.start();
      return {
        done,
        stop() {
          try {
            source.stop();
          } catch {
            // already stopped
          }
        },
      };
    },
  };
}

export class ElevenLabsProvider implements SpeakerProvider {
  readonly name = 'elevenlabs';
  // Not readonly: setVoice() swaps in the configured coach voice once the proxy answers.
  private o: Required<Omit<ElevenLabsOptions, 'dispatcherVoiceId' | 'voiceName' | 'fetchFn' | 'player' | 'now'>> &
    Pick<ElevenLabsOptions, 'dispatcherVoiceId' | 'voiceName'>;
  private readonly fetchFn: typeof fetch;
  private readonly player: AudioPlayer;
  private readonly now: () => number;
  /** (voice, model, text) -> decoded audio. The whole protocol fits here comfortably. */
  private readonly cache = new Map<string, unknown>();
  private consecutiveFailures = 0;
  /**
   * While unhealthy, the next moment a line may try the network again. Only warm() used to
   * reset the failure count, and LiveApp warms once at LAUNCH: a wifi blip early in a run
   * left every later line on the local voice for the rest of the session, even after the
   * network came back. One probe every retryIntervalMs costs at most one late line.
   */
  private retryAfter = Number.NEGATIVE_INFINITY;
  /**
   * Bumped by every cancel(). A speak that was waiting on the network when the queue moved on
   * compares the epoch it started in against this one and drops its result. Without it, a
   * narration line preempted by a critical still arrived: the aborted fetch returned null, and
   * the "network missed, use the local voice" branch spoke the dead line over the top of the
   * critical that replaced it. Aborting the request is not the same as cancelling the line.
   */
  private epoch = 0;
  private inFlight: AbortController | null = null;
  private playing: { stop(): void } | null = null;

  constructor(options: ElevenLabsOptions) {
    this.o = { ...DEFAULTS, ...options };
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
    this.player = options.player ?? webAudioPlayer();
    this.now = options.now ?? (() => Date.now());
  }

  /** True while recent lines are actually coming out of ElevenLabs, for the debug panel. */
  healthy(): boolean {
    return this.consecutiveFailures < this.o.maxConsecutiveFailures;
  }

  cachedLineCount(): number {
    return this.cache.size;
  }

  /** The coach voice in use, for the debug panel. */
  voice(): { voiceId: string; voiceName: string } {
    return { voiceId: this.o.voiceId, voiceName: this.o.voiceName ?? this.o.voiceId };
  }

  /**
   * Swap the coach voice (ELEVENLABS_COACH_VOICE, resolved by the proxy). The cache is keyed
   * by voice, so lines warmed for the old voice stay and the new one warms on its own; the
   * dispatcher voice and the fallback are untouched.
   */
  setVoice(voice: { voiceId: string; voiceName?: string }): void {
    this.o = { ...this.o, voiceId: voice.voiceId, voiceName: voice.voiceName };
  }

  /** What the debug panel shows: this voice while lines are landing, the fallback's once not. */
  currentVoiceName(): string | null {
    if (this.healthy()) return `ElevenLabs ${this.o.voiceName ?? this.o.voiceId}`;
    const fallback = this.o.fallback as SpeakerProvider & { currentVoiceName?(): string | null };
    return fallback.currentVoiceName?.() ?? fallback.name;
  }

  private key(voiceId: string, text: string): string {
    return `${voiceId}|${this.o.modelId}|${text}`;
  }

  private voiceFor(opts?: SpeakOptions): string | null {
    if (opts?.voice === 'dispatcher') return this.o.dispatcherVoiceId ?? null;
    return this.o.voiceId;
  }

  async speak(text: string, opts?: SpeakOptions): Promise<void> {
    const mine = this.epoch;
    const voiceId = this.voiceFor(opts);
    // No second ElevenLabs voice configured: the dispatcher speaks on the local fallback,
    // which has a second voice of its own. Never silently reuse the coach's voice.
    if (voiceId === null) return this.o.fallback.speak(text, opts);

    const cached = this.cache.get(this.key(voiceId, text));
    if (cached !== undefined) return this.play(cached, text, opts);

    // The session already proved the network is not delivering: stop burning the budget
    // on every line and go straight to the voice that always works. One line per interval
    // still probes, so a network that came back is noticed without a second warm().
    if (!this.healthy()) {
      if (this.now() < this.retryAfter) return this.o.fallback.speak(text, opts);
      this.retryAfter = this.now() + this.o.retryIntervalMs;
    }

    const decoded = await this.synthesize(voiceId, text, true);
    // Cancelled while the network had it: keep the bytes, say nothing.
    if (mine !== this.epoch) {
      if (decoded !== null) this.cache.set(this.key(voiceId, text), decoded);
      return;
    }
    if (decoded === null) {
      this.noteFailure();
      return this.o.fallback.speak(text, opts);
    }
    this.consecutiveFailures = 0;
    this.cache.set(this.key(voiceId, text), decoded);
    return this.play(decoded, text, opts);
  }

  /** One more miss; the first that crosses the threshold also starts the retry clock. */
  private noteFailure(): void {
    const wasHealthy = this.healthy();
    this.consecutiveFailures++;
    if (wasHealthy && !this.healthy()) this.retryAfter = this.now() + this.o.retryIntervalMs;
  }

  /**
   * Pre-synthesize the canonical lines (docs/04's cache idea): one warm run costs roughly
   * 40 lines x ~90 chars x 0.5 credits, then every replay is free and offline-capable.
   */
  async warm(lines: readonly string[], voiceId?: string): Promise<number> {
    voiceId ??= this.o.voiceId;
    let cachedCount = 0;
    for (const line of lines) {
      if (this.cache.has(this.key(voiceId, line))) {
        cachedCount++;
        continue;
      }
      const decoded = await this.synthesize(voiceId, line);
      if (decoded !== null) {
        this.cache.set(this.key(voiceId, line), decoded);
        this.consecutiveFailures = 0;
        cachedCount++;
      }
    }
    return cachedCount;
  }

  /**
   * The scripted call-taker's lines in the dispatcher voice (Sarah), so the first CALL 911
   * tap does not wait on the network for its opener. Nothing to warm without a second voice:
   * those lines speak on the fallback, which needs no cache.
   */
  async warmDispatcher(lines: readonly string[]): Promise<number> {
    if (!this.o.dispatcherVoiceId) return 0;
    return this.warm(lines, this.o.dispatcherVoiceId);
  }

  /**
   * Bytes fetched through the proxy and decoded, or null on any miss within the budget.
   * Only a line being spoken registers as `inFlight`: warming shares the method but must not
   * become the request that the next cancel() aborts, or cancel stops the warm and lets the
   * line it was meant to stop play on to the end.
   */
  private async synthesize(voiceId: string, text: string, cancellable = false): Promise<unknown | null> {
    const controller = new AbortController();
    if (cancellable) this.inFlight = controller;
    const timer = setTimeout(() => controller.abort(), this.o.firstAudioTimeoutMs);
    try {
      const res = await this.fetchFn(
        `${this.o.baseUrl}/v1/text-to-speech/${voiceId}/stream?output_format=${this.o.outputFormat}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, model_id: this.o.modelId }),
          signal: controller.signal,
        },
      );
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      return await this.player.decode(bytes);
    } catch {
      return null; // timeout, network, decode: all the same answer — use the fallback
    } finally {
      clearTimeout(timer);
      if (this.inFlight === controller) this.inFlight = null;
    }
  }

  private play(decoded: unknown, text: string, opts?: SpeakOptions): Promise<void> {
    const rate = 1 + 0.04 * (opts?.insistence ?? 0);
    const handle = this.player.play(decoded, {
      // Pre-rendered audio cannot change words or pitch; a nudge of playback rate carries
      // the insistence instead. Subtle on purpose.
      rate,
      onStart: () => opts?.onStart?.(),
    });
    this.playing = handle;
    // Race the audio against its own length: a source whose onended never comes (the
    // context was suspended under us) is stopped, counted as a miss, and the line is over.
    const seconds = (decoded as { duration?: unknown } | null)?.duration;
    const budgetMs = (typeof seconds === 'number' ? (seconds * 1000) / rate : text.length * MS_PER_CHAR) + PLAYBACK_SLACK_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), budgetMs);
    });
    return Promise.race([handle.done.then(() => false), timedOut]).then((stalled) => {
      if (timer !== null) clearTimeout(timer);
      if (stalled) {
        handle.stop();
        this.noteFailure();
      }
      if (this.playing === handle) this.playing = null;
    });
  }

  cancel(): void {
    this.epoch++;
    this.inFlight?.abort();
    this.inFlight = null;
    this.playing?.stop();
    this.playing = null;
    this.o.fallback.cancel();
  }

  async unlock(): Promise<void> {
    await Promise.all([this.player.unlock?.(), this.o.fallback.unlock?.()]);
  }
}
