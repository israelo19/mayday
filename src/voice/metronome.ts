// Web Audio metronome, docs/04. Independent of speech: nothing pauses it except stop().
// Uses a lookahead scheduler (ticks are placed on the audio clock ahead of time) so
// main-thread jank from MediaPipe cannot make the beat stutter. Owned by P3 (docs/07).

export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextBeatAt = 0; // audio-clock seconds
  private beat = 0;
  private bpm = 110;

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
    if (ctx.state !== 'running') await ctx.resume();
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  currentBpm(): number {
    return this.bpm;
  }

  /** Start at bpm, or change bpm if already running (takes effect on the next beat). */
  start(bpm = 110): void {
    if (!Metronome.available()) return;
    this.bpm = bpm;
    if (this.timer !== null) return;
    const ctx = this.ensureCtx();
    void ctx.resume();
    this.beat = 0;
    this.nextBeatAt = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), Metronome.INTERVAL_MS);
  }

  stop(): void {
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

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const period = 60 / this.bpm;
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
