// Pure signal helpers, docs/03. No DOM, no MediaPipe: unit-testable and replayable.
// Owned by P1 (docs/07). Peak detection, rate and recoil are M1 and go in this file.

/** MediaPipe pose landmark indices we use. */
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;

export type Sample = { t: number; y: number };

type LandmarkLike = { x: number; y: number; visibility: number };

/** s(t): average shoulder y in normalized image coords. Pushing down makes it larger. */
export function shoulderMidY(lm: readonly LandmarkLike[]): number {
  return (lm[LEFT_SHOULDER].y + lm[RIGHT_SHOULDER].y) / 2;
}

/** Confidence for the signal: min visibility across the landmarks we use. */
export function shoulderConfidence(lm: readonly LandmarkLike[]): number {
  return Math.min(lm[LEFT_SHOULDER].visibility, lm[RIGHT_SHOULDER].visibility);
}

/** Normalized shoulder-to-shoulder distance (camera-distance proxy for guidance). */
export function shoulderSpan(lm: readonly LandmarkLike[]): number {
  const a = lm[LEFT_SHOULDER];
  const b = lm[RIGHT_SHOULDER];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Exponential moving average. alpha ~0.3 per docs/03. */
export class Ema {
  private v: number | null = null;
  constructor(public alpha: number) {}
  push(x: number): number {
    this.v = this.v === null ? x : this.v + this.alpha * (x - this.v);
    return this.v;
  }
  value(): number | null {
    return this.v;
  }
  reset(): void {
    this.v = null;
  }
}

/** Time-indexed ring of samples; keeps only the trailing keepMs. */
export class TimeSeries {
  private buf: Sample[] = [];
  constructor(private readonly keepMs: number) {}

  push(t: number, y: number): void {
    this.buf.push({ t, y });
    const cutoff = t - this.keepMs;
    let drop = 0;
    while (drop < this.buf.length && this.buf[drop].t < cutoff) drop++;
    if (drop > 0) this.buf.splice(0, drop);
  }

  /** Samples within the trailing windowMs of the newest sample. */
  window(windowMs: number): readonly Sample[] {
    const last = this.buf[this.buf.length - 1];
    if (!last) return [];
    const cutoff = last.t - windowMs;
    let i = this.buf.length;
    while (i > 0 && this.buf[i - 1].t >= cutoff) i--;
    return this.buf.slice(i);
  }

  last(): Sample | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  clear(): void {
    this.buf = [];
  }
}
