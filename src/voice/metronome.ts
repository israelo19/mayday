// Web Audio metronome, docs/04. Independent of speech: nothing pauses it except stop().
// Uses a lookahead scheduler (ticks are placed on the audio clock ahead of time) so
// main-thread jank from MediaPipe cannot make the beat stutter. Owned by P3 (docs/07).

export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextBeatAt = 0; // audio-clock seconds
  private beat = 0;
  private bpm = 110;
  /** Running, but the page is hidden: the interval is cleared and start() resumes it on return. */
  private pausedByPage = false;
  private visibilityHook: (() => void) | null = null;

  private static readonly LOOKAHEAD_S = 0.2;
  private static readonly INTERVAL_MS = 25;

  static available(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window;
  }

  private ensureCtx(): AudioContext {
    this.ctx ??= new AudioContext();
    return this.ctx;
  }

  /** Call from inside a user gesture (a tap) so the browser allows audio at all. */
  async unlock(): Promise<void> {
    if (!Metronome.available()) return;
    const ctx = this.ensureCtx();
    if (ctx.state === 'running') return;
    await ctx.resume();
  }

  isRunning(): boolean {
    return this.timer !== null || this.pausedByPage;
  }

  currentBpm(): number {
    return this.bpm;
  }

  /** Start at bpm, or change bpm if already running (takes effect on the next beat). */
  start(bpm = 110): void {
    if (!Metronome.available()) return;
    this.bpm = bpm;
    this.watchPage();
    if (this.timer !== null) return;
    if (this.pageHidden()) {
      // The beat belongs to a screen someone is looking at; it starts when the page shows.
      this.pausedByPage = true;
      return;
    }
    this.pausedByPage = false;
    const ctx = this.ensureCtx();
    void ctx.resume();
    this.beat = 0;
    this.nextBeatAt = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), Metronome.INTERVAL_MS);
  }

  stop(): void {
    this.pausedByPage = false;
    this.unwatchPage();
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Short two-tone attention chirp played before a critical line (docs/07 P3): under
   * stress the first word of an unannounced sentence goes unheard, so a non-verbal cue
   * lands first. Distinct from the tick (sine sweep, not square) and independent of the
   * beat — the metronome itself never pauses for it.
   */
  earcon(): void {
    if (!Metronome.available()) return;
    const ctx = this.ensureCtx();
    void ctx.resume();
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, at);
    osc.frequency.setValueAtTime(1000, at + 0.04);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.6, at + 0.005);
    gain.gain.setValueAtTime(0.6, at + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.1);
  }

  // ---- page visibility ----------------------------------------------------------------
  // A hidden page throttles setInterval to once a second or less while the audio clock keeps
  // running, so every firing would dump every missed beat at once, and with nobody looking at
  // the screen nothing ever stops it. Pause while hidden, resume on return.

  private pageHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  private watchPage(): void {
    if (this.visibilityHook || typeof document === 'undefined') return;
    this.visibilityHook = () => {
      if (this.pageHidden()) {
        if (this.timer === null) return;
        clearInterval(this.timer);
        this.timer = null;
        this.pausedByPage = true;
      } else if (this.pausedByPage) {
        this.pausedByPage = false;
        this.start(this.bpm);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHook);
  }

  private unwatchPage(): void {
    if (!this.visibilityHook || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this.visibilityHook);
    this.visibilityHook = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const period = 60 / this.bpm;
    if (this.nextBeatAt < ctx.currentTime) {
      // The interval fell behind the audio clock (a throttled tab, a long main-thread stall).
      // Missed beats are gone; a burst of them now would be noise, not a rhythm.
      this.nextBeatAt = ctx.currentTime + 0.05;
      this.beat = 0;
    }
    while (this.nextBeatAt < ctx.currentTime + Metronome.LOOKAHEAD_S) {
      this.tick(ctx, this.nextBeatAt, this.beat % 4 === 0);
      this.nextBeatAt += period;
      this.beat++;
    }
  }

  private tick(ctx: AudioContext, at: number, accent: boolean): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.35, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}
