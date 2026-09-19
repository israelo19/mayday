// How well the bystander is doing, derived from PerceptionFacts for display only.
// The thresholds are the docs/02 coaching-rule numbers so the picture and the voice
// agree. The engine (src/protocol, P2) stays the authority on what is said; this file
// only decides how the picture emphasizes it. Owned by P4.
import type { CoachingEvent, PerceptionFacts } from '../../types';

// =============================================================================
// Module Overview
// =============================================================================
// `judge` folds facts into a `Judgement` (rate band, activity, recoil, visibility,
// hands on the wound). `emphasisFrom` maps the engine's `CoachingEvent` dedupe keys to
// an `Emphasis` the scenes know how to draw. Both are pure.

/** Rate bands. `ok` is the AHA 100-120 target; docs/02 corrects below 100 and above 125. */
export type RateBand = 'low' | 'ok' | 'fast' | 'high' | 'unknown';

export type Judgement = {
  /** False until the first facts arrive, so the picture shows nothing about a bystander it has not seen. */
  hasFacts: boolean;
  rateBand: RateBand;
  rate: number | null;
  /** Oscillation seen in the last 2 s (docs/03). */
  active: boolean;
  /** `recoilRatio` at or above the docs/02 correction threshold; null when unmeasured. */
  recoilOk: boolean | null;
  /** Pose confidence at or above the docs/02 blind threshold. */
  visible: boolean;
  handsOn: boolean | null;
};

/** The docs/02 coaching-rule keys a scene can emphasize. */
export type Emphasis = 'rate-low' | 'rate-high' | 'recoil' | 'stopped' | 'hands-off' | 'blind';

/** Thresholds from docs/02 `cardiac.compressions` and `bleeding.pressure`, and docs/03 confidence. */
export const THRESHOLDS = {
  rateLow: 100,
  rateTargetHigh: 120,
  rateHigh: 125,
  recoilMin: 0.6,
  confidenceMin: 0.5,
} as const;

const NO_FACTS: Judgement = { hasFacts: false, rateBand: 'unknown', rate: null, active: false, recoilOk: null, visible: false, handsOn: null };

/** Fold the latest facts into what the picture should show. Null facts mean nothing is known yet. */
export function judge(facts: PerceptionFacts | null | undefined): Judgement {
  if (!facts) return NO_FACTS;
  const visible = facts.poseConfidence >= THRESHOLDS.confidenceMin;
  // Below the confidence gate every derived metric is untrustworthy (docs/03), so it is not shown.
  const rate = visible ? facts.compressionRate : null;
  return {
    hasFacts: true,
    rateBand: rateBandOf(rate),
    rate,
    active: visible && facts.compressionActive,
    recoilOk: visible && facts.recoilRatio !== null ? facts.recoilRatio >= THRESHOLDS.recoilMin : null,
    visible,
    handsOn: visible ? facts.handsOnRegion : null,
  };
}

/** Which band a rate falls in; null rates are `unknown`. */
export function rateBandOf(rate: number | null): RateBand {
  if (rate === null || !Number.isFinite(rate)) return 'unknown';
  if (rate < THRESHOLDS.rateLow) return 'low';
  if (rate <= THRESHOLDS.rateTargetHigh) return 'ok';
  if (rate <= THRESHOLDS.rateHigh) return 'fast';
  return 'high';
}

const EMPHASES: ReadonlySet<string> = new Set<Emphasis>(['rate-low', 'rate-high', 'recoil', 'stopped', 'hands-off', 'blind']);

/** The emphasis for the engine's latest event, or null when the event carries no known dedupe key. */
export function emphasisFrom(event: CoachingEvent | null | undefined): Emphasis | null {
  const key = event?.dedupeKey;
  return key !== undefined && EMPHASES.has(key) ? (key as Emphasis) : null;
}
