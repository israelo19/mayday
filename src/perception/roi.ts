// Pure wound-region logic, docs/03 "Hands-on-region". No DOM, no MediaPipe: unit-tested in
// roi.test.ts. No blood detection: the ROI is wherever the rescuer's hands settle after being
// told to press. Owned by P1.

/** One hand reduced to what the ROI logic needs, in normalized image coordinates. */
export type Hand = { cx: number; cy: number; width: number };

type Pt = { x: number; y: number };
const PALM = [0, 5, 9, 13, 17]; // wrist + the four finger bases: a stable palm centre
const INDEX_MCP = 5;
const PINKY_MCP = 17;

export function palmCenter(lm: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const i of PALM) {
    x += lm[i].x;
    y += lm[i].y;
  }
  return { x: x / PALM.length, y: y / PALM.length };
}

export function handWidth(lm: readonly Pt[]): number {
  return Math.hypot(lm[INDEX_MCP].x - lm[PINKY_MCP].x, lm[INDEX_MCP].y - lm[PINKY_MCP].y);
}

export type RoiState = 'idle' | 'locking' | 'locked' | 'failed';

export type Roi = {
  state: RoiState;
  cx: number;
  cy: number;
  r: number;
  /** null unless locked */
  handsOn: boolean | null;
  /** continuous ms both hands have been off the region; null unless locked */
  handsOffMs: number | null;
  /** ms spent locking so far (progress for the UI) */
  lockingMs: number;
};

export type RoiOptions = {
  stableMs: number; // hands must hold still this long
  stableStd: number; // ...with this much positional spread (normalized units)
  failAfterMs: number; // give up and go verbal-only (docs/03 step 3)
  radiusFactor: number; // radius = factor x hand span
  minRadius: number;
  graceMs: number; // hands briefly undetected keep their last state this long
};

export const DEFAULT_ROI_OPTIONS: RoiOptions = {
  stableMs: 1500,
  stableStd: 0.015,
  failAfterMs: 10_000,
  radiusFactor: 1.5,
  minRadius: 0.08,
  graceMs: 700,
};

/**
 * Pure ROI state machine. lock() starts watching for both hands to settle; once they hold
 * still for stableMs the region is a circle around them. Then handsOn / handsOffMs track
 * whether at least one palm centre stays inside. No stabilization within failAfterMs ->
 * 'failed', and the caller announces verbal-only coaching.
 */
export class RoiTracker {
  private state: RoiState = 'idle';
  private startedAt = 0;
  private samples: { t: number; x: number; y: number; span: number }[] = [];
  private cx = 0;
  private cy = 0;
  private r = 0;
  private on: boolean | null = null;
  private offSince: number | null = null;
  private lastSeenAt: number | null = null;
  private lastNow = 0;

  constructor(private readonly opts: RoiOptions = DEFAULT_ROI_OPTIONS) {}

  lock(now: number): void {
    this.state = 'locking';
    this.startedAt = now;
    this.samples = [];
    this.on = null;
    this.offSince = null;
    this.lastSeenAt = null;
    this.lastNow = now;
  }

  unlock(): void {
    this.state = 'idle';
    this.samples = [];
    this.on = null;
    this.offSince = null;
  }

  update(hands: readonly Hand[], now: number): Roi {
    this.lastNow = now;
    if (this.state === 'locking') this.updateLocking(hands, now);
    if (this.state === 'locked') this.updateLocked(hands, now);
    return this.snapshot();
  }

  snapshot(): Roi {
    const locked = this.state === 'locked';
    return {
      state: this.state,
      cx: this.cx,
      cy: this.cy,
      r: this.r,
      handsOn: locked ? this.on : null,
      handsOffMs: locked ? (this.on === false && this.offSince !== null ? this.lastNow - this.offSince : 0) : null,
      lockingMs: this.state === 'locking' ? this.lastNow - this.startedAt : 0,
    };
  }

  private updateLocking(hands: readonly Hand[], now: number): void {
    if (hands.length > 0) {
      let x = 0;
      let y = 0;
      let width = 0;
      for (const h of hands) {
        x += h.cx;
        y += h.cy;
        width += h.width;
      }
      x /= hands.length;
      y /= hands.length;
      width /= hands.length;
      const between = hands.length === 2 ? Math.hypot(hands[0].cx - hands[1].cx, hands[0].cy - hands[1].cy) : 0;
      this.samples.push({ t: now, x, y, span: Math.max(between, width) });
    }
    const from = now - this.opts.stableMs;
    while (this.samples.length && this.samples[0].t < from) this.samples.shift();

    const covered = this.samples.length >= 10 && this.samples[0].t <= from + 150;
    if (covered) {
      const n = this.samples.length;
      const mx = this.samples.reduce((a, s) => a + s.x, 0) / n;
      const my = this.samples.reduce((a, s) => a + s.y, 0) / n;
      const sx = Math.sqrt(this.samples.reduce((a, s) => a + (s.x - mx) ** 2, 0) / n);
      const sy = Math.sqrt(this.samples.reduce((a, s) => a + (s.y - my) ** 2, 0) / n);
      if (sx < this.opts.stableStd && sy < this.opts.stableStd) {
        const span = this.samples.reduce((a, s) => a + s.span, 0) / n;
        this.cx = mx;
        this.cy = my;
        this.r = Math.max(this.opts.minRadius, this.opts.radiusFactor * span);
        this.state = 'locked';
        this.on = true;
        this.offSince = null;
        this.lastSeenAt = now;
        return;
      }
    }
    if (now - this.startedAt >= this.opts.failAfterMs) this.state = 'failed';
  }

  private updateLocked(hands: readonly Hand[], now: number): void {
    if (hands.length > 0) this.lastSeenAt = now;
    const inside = hands.some((h) => Math.hypot(h.cx - this.cx, h.cy - this.cy) <= this.r);
    if (inside) {
      this.on = true;
      this.offSince = null;
      return;
    }
    const undetected = hands.length === 0;
    const withinGrace = undetected && this.lastSeenAt !== null && now - this.lastSeenAt < this.opts.graceMs;
    if (withinGrace) return; // keep the previous state for a moment
    if (this.on !== false) {
      this.on = false;
      this.offSince = now;
    }
  }
}

/**
 * Choking gesture (STRETCH, behind a flag, docs/03): both palm centres near the neck for
 * a sustained time. A suggestion fact only; it never starts a protocol.
 */
export class ChokingGestureDetector {
  private since: number | null = null;
  constructor(
    private readonly holdMs = 1500,
    private readonly radiusFactor = 0.9,
  ) {}

  update(hands: readonly Hand[], neck: { x: number; y: number; span: number } | null, now: number): boolean {
    if (!neck || hands.length < 2) {
      this.since = null;
      return false;
    }
    const radius = this.radiusFactor * neck.span;
    const near = hands.every((h) => Math.hypot(h.cx - neck.x, h.cy - neck.y) <= radius);
    if (!near) {
      this.since = null;
      return false;
    }
    this.since ??= now;
    return now - this.since >= this.holdMs;
  }
}
