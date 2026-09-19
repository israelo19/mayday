// Voice out, docs/04. M0 ships the SpeakerProvider interface and the always-working
// WebSpeech implementation. The priority queue (critical preempts, correction coalesces,
// narration when idle) is M1 and lives next to this file. Owned by P2 (docs/07).

/** Something that can speak one utterance and cancel it. */
export interface SpeakerProvider {
  readonly name: string;
  /** Resolves when the utterance ends or is cancelled. Never rejects: speech failing must never break coaching. */
  speak(text: string): Promise<void>;
  cancel(): void;
}

/** Web Speech API synthesis. Works offline, needs no keys. The floor everything falls back to. */
export class WebSpeechProvider implements SpeakerProvider {
  readonly name = 'webspeech';
  private voice: SpeechSynthesisVoice | null = null;
  private current: SpeechSynthesisUtterance | null = null;

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

  speak(text: string): Promise<void> {
    if (!WebSpeechProvider.available()) return Promise.resolve();
    this.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = this.rate;
      if (this.voice) u.voice = this.voice;
      const done = () => {
        if (this.current === u) this.current = null;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      this.current = u;
      // Chrome can get stuck in a paused state after a cancel(); resume() is harmless otherwise.
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (!WebSpeechProvider.available()) return;
    this.current = null;
    speechSynthesis.cancel();
  }
}
