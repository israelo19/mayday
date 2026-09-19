// FakePerception: synthetic facts for driving the engine with no camera and no human on a
// pillow. Enabled with ?fake=1. The generator underneath is pure, so the engine tests and the
// live demo are fed by the same code. Owned by P2 (docs/07); kept in step with P1's Perception
// interface (roi(), tuning, the wider debug surface) by whoever changes that interface.
import type { PerceptionFacts } from '../types';
import type { Perception, PerceptionDebug, PerceptionMode, PerceptionStatus } from './index';
import type { Roi } from './roi';
import { DEFAULT_TUNING, GUIDANCE, type Sample, type Tuning } from './signal';

export type FakeControls = {
  /** What the pretend rescuer is actually doing, in compressions per minute. */
  rate: number;
  compressing: boolean;
  /** Stands in for a covered lens or a bad angle: confidence collapses, metrics go null. */
  cameraCovered: boolean;
  /** Bleeding module: hands on the wound, off it, or null when no ROI is being tracked. */
  handsOn: boolean | null;
  recoilRatio: number;
};

const DEFAULTS: FakeControls = {
  rate: 110,
  compressing: true,
  cameraCovered: false,
  handsOn: null,
  recoilRatio: 0.85,
};

/** Facts the engine would see if the rescuer behaved exactly as the controls say. */
export class FakeFacts {
  readonly controls: FakeControls;
  private handsOffSince: number | null = null;
  private startedAt: number | null = null;

  constructor(controls: Partial<FakeControls> = {}) {
    this.controls = { ...DEFAULTS, ...controls };
  }

  set(patch: Partial<FakeControls>): void {
    Object.assign(this.controls, patch);
  }

  at(t: number): PerceptionFacts {
    const c = this.controls;
    if (this.startedAt === null) this.startedAt = t;
    if (c.handsOn !== false) this.handsOffSince = null;
    else if (this.handsOffSince === null) this.handsOffSince = t;

    if (c.cameraCovered) {
      // Exactly what the real module does below the confidence gate: measurements disappear.
      return {
        t,
        poseConfidence: 0.15,
        compressionRate: null,
        compressionActive: false,
        recoilRatio: null,
        handsOnRegion: null,
        handsOffMs: null,
      };
    }
    // Rate needs a few cycles of history before the real module reports one (docs/03).
    const warm = t - this.startedAt >= 3000;
    return {
      t,
      poseConfidence: 0.92,
      compressionRate: c.compressing && warm ? c.rate : null,
      compressionActive: c.compressing,
      recoilRatio: c.compressing && warm ? c.recoilRatio : null,
      handsOnRegion: c.handsOn,
      handsOffMs: c.handsOn === null ? null : this.handsOffSince === null ? 0 : t - this.handsOffSince,
    };
  }
}

export interface FakePerceptionHandle extends Perception {
  readonly controls: FakeControls;
  setControls(patch: Partial<FakeControls>): void;
  /** Emit one frame at an explicit time. Tests use this instead of the timer. */
  emitAt(t: number): PerceptionFacts;
}

/** The `?fake=1` contract lives here so P4's swap in session.ts is one line. */
export function isFakeRequested(search = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('fake') === '1';
}

export function createFakePerception(
  opts: { controls?: Partial<FakeControls>; intervalMs?: number } = {},
): FakePerceptionHandle {
  return new FakePerception(opts.controls, opts.intervalMs ?? 100);
}

class FakePerception implements FakePerceptionHandle {
  private readonly generator: FakeFacts;
  private readonly subs = new Set<(f: PerceptionFacts) => void>();
  private readonly series: Sample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: PerceptionStatus = 'idle';
  private mode: PerceptionMode = 'pose';
  private roiState: Roi['state'] = 'idle';
  private tuning: Tuning = { ...DEFAULT_TUNING };
  private last: PerceptionFacts | null = null;
  private phase = 0;

  constructor(
    controls: Partial<FakeControls> | undefined,
    private readonly intervalMs: number,
  ) {
    this.generator = new FakeFacts(controls);
  }

  get controls(): FakeControls {
    return this.generator.controls;
  }

  setControls(patch: Partial<FakeControls>): void {
    this.generator.set(patch);
  }

  async start(): Promise<void> {
    this.stop();
    this.status = 'running';
    this.timer = setInterval(() => this.emitAt(Date.now()), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status = 'stopped';
  }

  emitAt(t: number): PerceptionFacts {
    const facts = this.generator.at(t);
    this.last = facts;
    this.pushSample(t, facts);
    for (const cb of this.subs) cb(facts);
    return facts;
  }

  subscribe(cb: (f: PerceptionFacts) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  getCameraGuidance(): string | null {
    return this.controls.cameraCovered ? GUIDANCE.unseen : null;
  }

  setMode(mode: PerceptionMode): void {
    this.mode = mode;
    if (mode === 'pose') this.roiState = 'idle';
  }

  lockRoi(): void {
    this.mode = 'pose+hands';
    this.roiState = 'locked';
  }

  unlockRoi(): void {
    this.roiState = 'idle';
  }

  /** A locked circle whenever the controls say hands are being tracked, so the UI can draw it. */
  roi(): Roi {
    const locked = this.roiState === 'locked' && this.controls.handsOn !== null;
    return {
      state: locked ? 'locked' : this.roiState,
      cx: 0.5,
      cy: 0.62,
      r: 0.12,
      handsOn: locked ? this.controls.handsOn : null,
      handsOffMs: locked ? (this.last?.handsOffMs ?? 0) : null,
      lockingMs: 0,
    };
  }

  captureFrame(): string | null {
    return null;
  }

  readonly debug: PerceptionDebug = {
    series: (windowMs: number) => this.series.filter((s) => s.t >= (this.series.at(-1)?.t ?? 0) - windowMs),
    peaks: () => [],
    fps: () => Math.round(1000 / this.intervalMs),
    status: () => this.status,
    error: () => null,
    raw: () => this.series.at(-1)?.y ?? null,
    facing: () => 'unknown' as const,
    delegate: () => null,
    frameSize: () => ({ width: 640, height: 480 }),
    source: () => null,
    mode: () => this.mode,
    handsReady: () => true,
    blind: () => this.controls.cameraCovered,
    confidenceRaw: () => this.last?.poseConfidence ?? 0,
    rateByCount: () => this.last?.compressionRate ?? null,
    luma: () => null,
    hands: () => [],
    chokingGesture: () => false,
    tuning: () => this.tuning,
    setTuning: (t) => {
      this.tuning = { ...this.tuning, ...t };
    },
    lastFacts: () => this.last,
  };

  /** A plausible waveform so the debug chart looks alive in fake mode. */
  private pushSample(t: number, facts: PerceptionFacts): void {
    this.phase += (facts.compressionActive ? this.controls.rate : 0) * (this.intervalMs / 60000) * 2 * Math.PI;
    const y = facts.compressionActive ? 0.5 + 0.03 * Math.sin(this.phase) : 0.5;
    this.series.push({ t, y });
    if (this.series.length > 600) this.series.shift();
  }
}
