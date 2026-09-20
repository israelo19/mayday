// Pure signal helpers, docs/03. No DOM, no MediaPipe: unit-tested in signal.test.ts and
// replayable from recorded clips. Owned by P1 (docs/07).
//
// The keystone signal is s(t) = average shoulder y of the rescuer in normalized image
// coordinates. Pushing down makes it larger. Everything the engine coaches on
// (compressionRate, compressionActive, recoilRatio) is derived from peaks in s(t).

/** MediaPipe pose landmark indices we use. */
export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;

export type Sample = { t: number; y: number };
export type Extreme = { t: number; y: number };

type LandmarkLike = { x: number; y: number; visibility: number };

export function shoulderMidY(lm: readonly LandmarkLike[]): number {
  return (lm[LEFT_SHOULDER].y + lm[RIGHT_SHOULDER].y) / 2;
}

export function shoulderMidX(lm: readonly LandmarkLike[]): number {
  return (lm[LEFT_SHOULDER].x + lm[RIGHT_SHOULDER].x) / 2;
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

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
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

// ---------------------------------------------------------------------------------------
// Tuning (exposed as debug sliders, docs/03)

export type Tuning = {
  /** EMA smoothing factor. Higher follows the raw signal more closely. */
  emaAlpha: number;
  /** Minimum excursion (normalized image units) for a peak or trough to count. */
  prominence: number;
  /** Minimum time between two peaks. 250 ms is the ~240/min physical ceiling. */
  refractoryMs: number;
};

export const DEFAULT_TUNING: Tuning = { emaAlpha: 0.3, prominence: 0.008, refractoryMs: 250 };

export const TUNING_RANGES: Record<keyof Tuning, { min: number; max: number; step: number }> = {
  emaAlpha: { min: 0.1, max: 0.6, step: 0.05 },
  prominence: { min: 0.002, max: 0.03, step: 0.001 },
  refractoryMs: { min: 150, max: 500, step: 10 },
};

export function clampTuning(t: Partial<Tuning>): Tuning {
  const out = { ...DEFAULT_TUNING };
  for (const key of Object.keys(TUNING_RANGES) as (keyof Tuning)[]) {
    const v = t[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const r = TUNING_RANGES[key];
    out[key] = Math.min(r.max, Math.max(r.min, v));
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Online peak detection

/**
 * Streaming peak/trough detector with hysteresis. A peak is confirmed once the signal has
 * fallen `prominence` below the running maximum; a trough once it has risen `prominence`
 * above the running minimum. A confirmed peak closer than `refractoryMs` to the previous
 * one is discarded. Confirmation lags the true extreme by however long the signal takes
 * to move `prominence`, typically one or two frames at compression speed.
 */
export class PeakDetector {
  private phase: 'init' | 'up' | 'down' = 'init';
  private hi: Extreme | null = null;
  private lo: Extreme | null = null;
  private peaks: Extreme[] = [];
  private troughs: Extreme[] = [];
  private lastPeakT = -Infinity;

  constructor(
    public prominence: number,
    public refractoryMs: number,
    private readonly keepMs = 30_000,
  ) {}

  /** Returns what, if anything, was confirmed on this sample. */
  push(t: number, y: number): 'peak' | 'trough' | null {
    if (!this.hi || !this.lo) {
      this.hi = { t, y };
      this.lo = { t, y };
      return null;
    }
    let event: 'peak' | 'trough' | null = null;
    if (this.phase === 'init') {
      if (y > this.hi.y) this.hi = { t, y };
      if (y < this.lo.y) this.lo = { t, y };
      if (y - this.lo.y >= this.prominence) {
        this.phase = 'up';
        this.hi = { t, y };
      } else if (this.hi.y - y >= this.prominence) {
        this.phase = 'down';
        this.lo = { t, y };
      }
    } else if (this.phase === 'up') {
      if (y > this.hi.y) {
        this.hi = { t, y };
      } else if (this.hi.y - y >= this.prominence) {
        if (this.hi.t - this.lastPeakT >= this.refractoryMs) {
          this.peaks.push(this.hi);
          this.lastPeakT = this.hi.t;
          event = 'peak';
        }
        this.phase = 'down';
        this.lo = { t, y };
      }
    } else {
      if (y < this.lo.y) {
        this.lo = { t, y };
      } else if (y - this.lo.y >= this.prominence) {
        this.troughs.push(this.lo);
        event = 'trough';
        this.phase = 'up';
        this.hi = { t, y };
      }
    }
    this.prune(t);
    return event;
  }

  peakTimes(): readonly number[] {
    return this.peaks.map((p) => p.t);
  }

  peakList(): readonly Extreme[] {
    return this.peaks;
  }

  troughList(): readonly Extreme[] {
    return this.troughs;
  }

  reset(): void {
    this.phase = 'init';
    this.hi = null;
    this.lo = null;
    this.peaks = [];
    this.troughs = [];
    this.lastPeakT = -Infinity;
  }

  private prune(now: number): void {
    const cutoff = now - this.keepMs;
    while (this.peaks.length && this.peaks[0].t < cutoff) this.peaks.shift();
    while (this.troughs.length && this.troughs[0].t < cutoff) this.troughs.shift();
  }
}

// ---------------------------------------------------------------------------------------
// Derived metrics (docs/03 steps 4 and 5)

export const RATE_WINDOW_MS = 10_000;
export const RATE_MIN_PEAKS = 5;
export const RATE_MAX = 160;
export const ACTIVE_WINDOW_MS = 2_000;
export const ACTIVE_MIN_PEAKS = 2;

function recentTimes(peakTimes: readonly number[], now: number, windowMs: number): number[] {
  const from = now - windowMs;
  return peakTimes.filter((t) => t >= from && t <= now);
}

/**
 * Compressions per minute from the median of the last five intervals between peaks.
 * Null until five peaks exist in the trailing 10 s. Capped at 160 (docs/03 sane range).
 * The median reacts within about five pushes, which is what makes a live correction
 * feel immediate; the plain count over 10 s is exposed separately for comparison.
 */
export function rateFromPeaks(peakTimes: readonly number[], now: number): number | null {
  const recent = recentTimes(peakTimes, now, RATE_WINDOW_MS);
  if (recent.length < RATE_MIN_PEAKS) return null;
  const last = recent.slice(-6);
  const gaps: number[] = [];
  for (let i = 1; i < last.length; i++) gaps.push(last[i] - last[i - 1]);
  const med = median(gaps);
  if (!Number.isFinite(med) || med <= 0) return null;
  return Math.min(RATE_MAX, Math.round(60_000 / med));
}

/** docs/03 literal definition: peaks in the trailing 10 s times six. */
export function rateByCount(peakTimes: readonly number[], now: number): number | null {
  const n = recentTimes(peakTimes, now, RATE_WINDOW_MS).length;
  return n < RATE_MIN_PEAKS ? null : Math.min(RATE_MAX, n * 6);
}

/** Oscillation detected: at least two peaks in the trailing 2 s. */
export function isActive(peakTimes: readonly number[], now: number): boolean {
  return recentTimes(peakTimes, now, ACTIVE_WINDOW_MS).length >= ACTIVE_MIN_PEAKS;
}

/**
 * Recoil proxy per compression: how far the chest came back up after the push, relative
 * to how far it went down. (peak - troughAfter) / (peak - troughBefore), clamped 0..1.
 * A proxy for full chest recoil; never a depth claim (docs/03).
 */
export function recoilRatios(peaks: readonly Extreme[], troughs: readonly Extreme[]): { t: number; ratio: number }[] {
  const out: { t: number; ratio: number }[] = [];
  let j = 0;
  for (const p of peaks) {
    while (j < troughs.length && troughs[j].t < p.t) j++;
    const before = troughs[j - 1];
    const after = troughs[j];
    if (!before || !after) continue;
    const down = p.y - before.y;
    if (down <= 0) continue;
    const up = p.y - after.y;
    out.push({ t: p.t, ratio: Math.max(0, Math.min(1, up / down)) });
  }
  return out;
}

/** Mean recoil over the last five complete cycles inside the rate window, else null. */
export function meanRecoil(peaks: readonly Extreme[], troughs: readonly Extreme[], now: number): number | null {
  const from = now - RATE_WINDOW_MS;
  const ratios = recoilRatios(peaks, troughs)
    .filter((r) => r.t >= from)
    .slice(-5);
  if (ratios.length === 0) return null;
  const sum = ratios.reduce((acc, r) => acc + r.ratio, 0);
  return Math.round((sum / ratios.length) * 100) / 100;
}

// ---------------------------------------------------------------------------------------
// Confidence gate (docs/03 step 6, principle 4: fail loud, never wrong)

/**
 * Turns a noisy per-frame confidence into a stable "blind" decision. Below threshold for
 * more than blindAfterMs -> blind: every derived metric is nulled and the low confidence
 * is emitted so the engine can announce it. Above threshold for a sustained recoverAfterMs
 * -> sighted again (and the low timer clears). While not blind the emitted confidence never
 * dips below the threshold, so a single bad frame cannot flap the engine into blind mode.
 */
export class ConfidenceGate {
  private lowSince: number | null = null;
  private goodSince: number | null = null;
  private blindNow = false;

  constructor(
    public readonly threshold = 0.5,
    public readonly blindAfterMs = 1000,
    public readonly recoverAfterMs = 300,
  ) {}

  update(confidence: number, now: number): { emitted: number; blind: boolean } {
    if (confidence < this.threshold) {
      this.goodSince = null;
      this.lowSince ??= now;
      if (now - this.lowSince >= this.blindAfterMs) this.blindNow = true;
    } else {
      this.goodSince ??= now;
      // A single good frame in a bad stretch does not reset the low timer; recovery has
      // to be sustained, otherwise flicker around the threshold could delay blind mode forever.
      if (now - this.goodSince >= this.recoverAfterMs) {
        this.lowSince = null;
        this.blindNow = false;
      }
    }
    const emitted = this.blindNow ? confidence : Math.max(confidence, this.threshold);
    return { emitted, blind: this.blindNow };
  }

  isBlind(): boolean {
    return this.blindNow;
  }

  reset(): void {
    this.lowSince = null;
    this.goodSince = null;
    this.blindNow = false;
  }
}

// ---------------------------------------------------------------------------------------
// Camera guidance (docs/03). Strings are guidance about the phone, never medical advice.

export type GuidanceInput = {
  now: number;
  /** Last time the shoulders were confidently visible, null if never. */
  shouldersSeenAt: number | null;
  /** Normalized shoulder span on the latest frame with a pose, else null. */
  span: number | null;
  /** Mean frame luminance 0..255, null if not sampled. */
  luma: number | null;
};

export const GUIDANCE = {
  dark: "It's too dark. Turn on a light.",
  unseen: "I can't see you. Prop the phone so I can see your chest and shoulders.",
  closer: 'Move the phone closer.',
  back: 'Move the phone back a little.',
} as const;

export const NO_POSE_MS = 3000;
export const SPAN_TOO_SMALL = 0.08;
export const SPAN_TOO_LARGE = 0.5;
export const LUMA_DARK = 40;

export function cameraGuidance(i: GuidanceInput): string | null {
  const unseenFor = i.shouldersSeenAt === null ? Infinity : i.now - i.shouldersSeenAt;
  if (unseenFor > NO_POSE_MS) {
    if (i.luma !== null && i.luma < LUMA_DARK) return GUIDANCE.dark;
    return GUIDANCE.unseen;
  }
  if (i.span !== null) {
    if (i.span < SPAN_TOO_SMALL) return GUIDANCE.closer;
    if (i.span > SPAN_TOO_LARGE) return GUIDANCE.back;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Which person to measure when the camera sees two (docs/03 "Who the camera watches")
// ---------------------------------------------------------------------------

export const NOSE = 0;
export const LEFT_EAR = 7;
export const RIGHT_EAR = 8;
/** A head landmark counts when at least this visible. */
const HEAD_VISIBLE = 0.3;

/**
 * A circle over the head: centre and radius in normalized image units, or null when too
 * little of the person shows.
 *
 * BlazePose marks the face but never the crown, so its topmost landmark is an eye or an ear.
 * Anything derived from the raw landmarks alone therefore stops at the eyebrows, which is why
 * the scene box used to cut a person's head off and the skeleton stopped at the shoulders.
 * This estimates the rest of the skull.
 *
 * Ear to ear is the skull at its widest, so it sets the scale; a turned head collapses that
 * distance, so shoulder span holds a floor under it. Ears and nose both sit below the crown,
 * so the circle is pushed along the neck axis, which keeps it right for a person lying down
 * or tilted rather than assuming up is up.
 */
export function headOf(lm: readonly LandmarkLike[]): { cx: number; cy: number; r: number } | null {
  const ls = lm[LEFT_SHOULDER];
  const rs = lm[RIGHT_SHOULDER];
  if (!ls || !rs || Math.min(ls.visibility, rs.visibility) < HEAD_VISIBLE) return null;
  const span = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const le = lm[LEFT_EAR];
  const re = lm[RIGHT_EAR];
  const nose = lm[NOSE];
  let ax: number;
  let ay: number;
  let r: number;
  if (le && re && Math.min(le.visibility, re.visibility) >= HEAD_VISIBLE) {
    ax = (le.x + re.x) / 2;
    ay = (le.y + re.y) / 2;
    r = Math.max(Math.hypot(le.x - re.x, le.y - re.y) * 0.85, span * 0.25);
  } else if (nose && nose.visibility >= HEAD_VISIBLE) {
    ax = nose.x;
    ay = nose.y;
    r = span * 0.3;
  } else {
    return null;
  }
  const dx = ax - shoulderMidX(lm);
  const dy = ay - shoulderMidY(lm);
  const len = Math.hypot(dx, dy);
  if (len === 0) return { cx: ax, cy: ay, r };
  return { cx: ax + (dx / len) * r * 0.35, cy: ay + (dy / len) * r * 0.35, r };
}

export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;

/** A pose whose shoulders are visible enough to measure. Same bar as the blind gate. */
const MEASURABLE_CONFIDENCE = 0.5;
/** Hips at least this many shoulder spans below the shoulders reads as kneeling or standing. */
export const UPRIGHT_MIN = 0.5;
/** A pose whose shoulder midpoint moved less than this since last frame is the same person. */
export const SAME_POSE_MAX_DIST = 0.15;

/**
 * How upright a pose is: hips below the shoulders in image space, in shoulder spans. A kneeling
 * rescuer scores near 1 or more; a patient lying flat scores near 0.
 */
export function uprightness(lm: readonly LandmarkLike[]): number {
  const span = shoulderSpan(lm);
  if (span <= 0) return 0;
  const hipY = (lm[LEFT_HIP].y + lm[RIGHT_HIP].y) / 2;
  return (hipY - shoulderMidY(lm)) / span;
}

/**
 * The pose to measure when more than one person is in frame: the rescuer, whose shoulders
 * move, never the patient, who lies flat. The pose chosen last frame is kept while it is still
 * upright and nearby, so a swap between two candidates cannot fake a compression.
 */
export function pickRescuer<T extends readonly LandmarkLike[]>(
  poses: readonly T[],
  previous: { x: number; y: number } | null,
): T | undefined {
  if (poses.length <= 1) return poses[0];
  const seen = poses.filter((p) => shoulderConfidence(p) >= MEASURABLE_CONFIDENCE);
  const candidates = seen.length > 0 ? seen : poses;
  if (previous) {
    const same = candidates.find(
      (p) => Math.hypot(shoulderMidX(p) - previous.x, shoulderMidY(p) - previous.y) <= SAME_POSE_MAX_DIST,
    );
    if (same && uprightness(same) >= UPRIGHT_MIN) return same;
  }
  return [...candidates].sort(
    (a, b) => uprightness(b) - uprightness(a) || shoulderConfidence(b) - shoulderConfidence(a),
  )[0];
}

// ---------------------------------------------------------------------------
// Scene hint for triage (docs/03): a person lying still. Cue only, never a route.
// ---------------------------------------------------------------------------

/** Torso within this many degrees of horizontal reads as lying down. Kneeling is ~70 or more. */
export const PERSON_DOWN_MAX_DEG = 25;
/** The pose must hold still that way this long, so someone bending to help does not trip it. */
export const PERSON_DOWN_HOLD_MS = 2000;
const HIP_VISIBLE = 0.5;

/** Angle of the shoulder-to-hip line from horizontal, in degrees: 0 lying across the frame, 90 upright. */
export function torsoAngleDeg(lm: readonly LandmarkLike[]): number {
  const dx = (lm[LEFT_HIP].x + lm[RIGHT_HIP].x) / 2 - shoulderMidX(lm);
  const dy = (lm[LEFT_HIP].y + lm[RIGHT_HIP].y) / 2 - shoulderMidY(lm);
  return (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
}

/** True once a measurable pose has lain near-horizontal for the hold time. */
export class PersonDownDetector {
  private since: number | null = null;
  constructor(
    private readonly holdMs = PERSON_DOWN_HOLD_MS,
    private readonly maxDeg = PERSON_DOWN_MAX_DEG,
  ) {}

  update(lm: readonly LandmarkLike[] | null, confident: boolean, now: number): boolean {
    const hipsSeen = !!lm && Math.min(lm[LEFT_HIP].visibility, lm[RIGHT_HIP].visibility) >= HIP_VISIBLE;
    if (!lm || !confident || !hipsSeen || torsoAngleDeg(lm) > this.maxDeg) {
      this.since = null;
      return false;
    }
    this.since ??= now;
    return now - this.since >= this.holdMs;
  }

  reset(): void {
    this.since = null;
  }
}
