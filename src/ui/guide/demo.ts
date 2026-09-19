// Gallery-only stand-ins so the guide can be seen reacting before P1's signal extraction
// and P2's engine land: a pretend bystander that emits PerceptionFacts and a live
// shoulder signal, and the docs/02 coaching rules evaluated without cooldowns. Nothing
// outside GuideGallery may import this file; the coach screen gets its facts from
// src/perception and its events from src/protocol. Owned by P4.
import type { CoachingEvent, PerceptionFacts } from '../../types';
import type { LiveSample } from './RhythmTrace';

// =============================================================================
// Module Overview
// =============================================================================
// `DemoBystander` is a tiny FakePerception: set a rate, recoil, a covered camera or hands
// off the wound and it produces the facts and the waveform a real bystander would.
// `demoCoaching` returns the docs/02 line those facts would trigger in a given state.

export type DemoControls = {
  /** Compressions per minute the pretend bystander is doing; null means they stopped. */
  rate: number | null;
  /** Recoil quality 0..1 (docs/03 proxy). */
  recoil: number;
  /** The lens is covered: confidence collapses and every metric goes untrusted. */
  covered: boolean;
  /** Bleeding module: hands are on the wound. */
  handsOn: boolean;
};

const KEEP_MS = 12_000;
const TICK_MS = 33;
const BASE_Y = 0.45;
const AMPLITUDE = 0.03;

export class DemoBystander {
  private controls: DemoControls = { rate: 110, recoil: 0.85, covered: false, handsOn: true };
  private samples: LiveSample[] = [];
  private peakTimes: number[] = [];
  private phase = 0;
  private lastT = 0;
  private stoppedAt: number | null = null;
  private handsOffAt: number | null = null;
  private timer: number | null = null;
  private readonly subs = new Set<(f: PerceptionFacts) => void>();

  start(): void {
    if (this.timer !== null) return;
    this.lastT = performance.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  get(): DemoControls {
    return { ...this.controls };
  }

  set(patch: Partial<DemoControls>): void {
    this.controls = { ...this.controls, ...patch };
  }

  subscribe(cb: (f: PerceptionFacts) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  /** Trailing shoulder-y samples, `performance.now()` based like src/perception. */
  readonly series = (): readonly LiveSample[] => this.samples;

  /** Timestamps of the pretend pushes. */
  readonly peaks = (): readonly number[] => this.peakTimes;

  /** How long the pretend bystander has not been pushing; 0 while active. */
  stoppedMs(): number {
    return this.stoppedAt === null ? 0 : performance.now() - this.stoppedAt;
  }

  private tick(): void {
    const now = performance.now();
    const dt = now - this.lastT;
    this.lastT = now;
    const { rate, recoil, covered, handsOn } = this.controls;

    let y = BASE_Y + (Math.random() - 0.5) * 0.003;
    if (rate !== null) {
      const before = Math.floor(this.phase);
      this.phase += (dt / 60_000) * rate;
      if (Math.floor(this.phase) > before) this.peakTimes.push(now);
      const depth = 0.5 + 0.5 * Math.cos(2 * Math.PI * this.phase);
      // Poor recoil means the chest never comes all the way back up: the trough sits higher.
      const floor = (1 - recoil) * 0.6;
      y += AMPLITUDE * (floor + (1 - floor) * depth);
      this.stoppedAt = null;
    } else {
      this.stoppedAt ??= now;
    }
    this.samples.push({ t: now, y });
    while (this.samples.length && this.samples[0].t < now - KEEP_MS) this.samples.shift();
    while (this.peakTimes.length && this.peakTimes[0] < now - KEEP_MS) this.peakTimes.shift();

    if (handsOn) this.handsOffAt = null;
    else this.handsOffAt ??= now;

    const facts: PerceptionFacts = {
      t: Date.now(),
      poseConfidence: covered ? 0.2 : 0.92,
      compressionRate: rate === null ? null : rate + (Math.random() - 0.5) * 2,
      compressionActive: rate !== null,
      recoilRatio: rate === null ? null : recoil,
      handsOnRegion: handsOn,
      handsOffMs: this.handsOffAt === null ? 0 : now - this.handsOffAt,
    };
    for (const cb of this.subs) cb(facts);
  }
}

/** The docs/02 rule these facts trigger in `stateKey`, immediately and without cooldown. Null when none. */
export function demoCoaching(stateKey: string, facts: PerceptionFacts, stoppedMs: number): CoachingEvent | null {
  if (stateKey === 'cardiac.compressions') {
    const stateId = 'compressions';
    if (facts.poseConfidence < 0.5) {
      return { priority: 'critical', text: "I can't see you clearly. I'll keep coaching by voice. Keep pushing to the beat.", stateId, dedupeKey: 'blind' };
    }
    if (!facts.compressionActive && stoppedMs >= 3_000) {
      return { priority: 'critical', text: "Don't stop. Keep pushing. Help is coming.", stateId, dedupeKey: 'stopped' };
    }
    const rate = facts.compressionRate;
    if (rate !== null && rate < 100 && facts.compressionActive) {
      return { priority: 'critical', text: 'Faster. Push with the beat.', stateId, dedupeKey: 'rate-low' };
    }
    if (rate !== null && rate > 125) {
      return { priority: 'correction', text: 'A little slower. Match the beat.', stateId, dedupeKey: 'rate-high' };
    }
    if (facts.recoilRatio !== null && facts.recoilRatio < 0.6) {
      return { priority: 'correction', text: 'Let the chest come all the way back up between pushes.', stateId, dedupeKey: 'recoil' };
    }
    return null;
  }
  if (stateKey === 'bleeding.pressure') {
    const stateId = 'pressure';
    if (facts.poseConfidence < 0.5) {
      // docs/02 leaves the bleeding blind line to P2; this is the CLAUDE.md wording.
      return { priority: 'critical', text: "I can't see clearly, I'll keep coaching by voice.", stateId, dedupeKey: 'blind' };
    }
    // Threshold from docs/07 decision 5: 1000 ms so the line lands inside the 1.5 s demo budget.
    if (facts.handsOffMs !== null && facts.handsOffMs > 1_000) {
      return { priority: 'critical', text: "Don't let go! Hands back on the wound. Press harder.", stateId, dedupeKey: 'hands-off' };
    }
  }
  return null;
}
