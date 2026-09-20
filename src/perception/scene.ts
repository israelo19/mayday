// Scene observation from pose alone (docs/11, tier 1): a box around each person the pose
// model sees, lying or upright, and how long they have held still. The published fall
// detectors are this plus a classifier; the rules here are the handcrafted end of that
// literature. Facts for the screen and for triage's question, never a route. Pure: the
// module feeds it every frame and scene.test.ts drives it with numbers. Owned by P1 (docs/07).
import type { PersonObservation, Posture, SceneObservation } from '../types';
import { headOf, LEFT_HIP, LEFT_SHOULDER, RIGHT_HIP, RIGHT_SHOULDER, torsoAngleDeg } from './signal';

type LandmarkLike = { x: number; y: number; visibility: number };

/** A landmark counts for the box when at least this visible. */
export const BOX_VISIBILITY = 0.3;
/** Padding around the landmarks, in normalized image units. */
export const BOX_PAD = 0.03;
/** Torso within this many degrees of horizontal reads as lying (docs/03's person-down angle). */
export const LYING_MAX_DEG = 25;
/** Torso this far from horizontal reads as upright; between the two is unknown. */
export const UPRIGHT_MIN_DEG = 50;
/** A box centre moving slower than this, in image widths per second, counts as still. */
export const STILL_MAX_SPEED = 0.05;
/**
 * Time constant for smoothing the box centre before its speed is measured, in ms.
 *
 * Speed used to be the raw frame-to-frame step divided by the frame interval. Landmark noise
 * does not shrink as frames get closer together but the allowance does, so at 30 fps the
 * centre was allowed about one pixel of a 640 px frame per frame and a motionless person read
 * "moving" forever. Worse, a faster camera was stricter than a slow one. Smoothing first puts
 * a floor under the interval: jitter is attenuated by roughly dt/tau while real movement
 * passes through at its own speed, so the threshold means the same thing at any frame rate.
 */
export const STILL_SMOOTH_MS = 400;
/** A pose whose box centre is within this of a tracked one is the same person. */
export const SAME_PERSON_MAX_DIST = 0.2;
/** A tracked person unseen for this long is forgotten; shorter gaps must not reset a stillness count. */
export const TRACK_KEEP_MS = 1000;

type Track = { cx: number; cy: number; t: number; stillSince: number | null; sx: number; sy: number };

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * The box around the person, or null when too little of them is seen.
 *
 * The visible landmarks set most of it, but BlazePose's topmost point is an eye or an ear, so
 * landmarks alone stop at the eyebrows and the box appears to cut the head off. `headOf`
 * estimates the rest of the skull and the box is widened to hold it.
 */
export function boxOf(lm: readonly LandmarkLike[]): { box: PersonObservation['box']; confidence: number } | null {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let seen = 0;
  for (const p of lm) {
    if (p.visibility < BOX_VISIBILITY) continue;
    seen++;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (seen < 4) return null;
  const head = headOf(lm);
  if (head) {
    minX = Math.min(minX, head.cx - head.r);
    minY = Math.min(minY, head.cy - head.r);
    maxX = Math.max(maxX, head.cx + head.r);
    maxY = Math.max(maxY, head.cy + head.r);
  }
  const x = clamp(minX - BOX_PAD);
  const y = clamp(minY - BOX_PAD);
  const box = { x, y, w: clamp(maxX + BOX_PAD) - x, h: clamp(maxY + BOX_PAD) - y };
  const confidence = Math.min(
    lm[LEFT_SHOULDER].visibility,
    lm[RIGHT_SHOULDER].visibility,
    lm[LEFT_HIP].visibility,
    lm[RIGHT_HIP].visibility,
  );
  return { box, confidence };
}

/** Lying, upright, or unknown when the torso is not visible enough or sits between the two. */
export function postureOf(lm: readonly LandmarkLike[]): Posture {
  const torsoSeen =
    Math.min(lm[LEFT_SHOULDER].visibility, lm[RIGHT_SHOULDER].visibility, lm[LEFT_HIP].visibility, lm[RIGHT_HIP].visibility) >= 0.5;
  if (!torsoSeen) return 'unknown';
  const deg = torsoAngleDeg(lm);
  if (deg <= LYING_MAX_DEG) return 'lying';
  if (deg >= UPRIGHT_MIN_DEG) return 'upright';
  return 'unknown';
}

/**
 * Follows each person across frames by box centre so a stillness count survives frame to
 * frame. A person who moves faster than STILL_MAX_SPEED starts over at zero.
 */
export class SceneTracker {
  private tracks: Track[] = [];

  update(poses: readonly (readonly LandmarkLike[])[], now: number): SceneObservation {
    const people: PersonObservation[] = [];
    const next: Track[] = [];
    const free = [...this.tracks];
    for (const lm of poses) {
      const found = boxOf(lm);
      if (!found) continue;
      const cx = found.box.x + found.box.w / 2;
      const cy = found.box.y + found.box.h / 2;
      let best = -1;
      let bestDist = SAME_PERSON_MAX_DIST;
      free.forEach((tr, i) => {
        const d = Math.hypot(tr.cx - cx, tr.cy - cy);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      const prev = best >= 0 ? free.splice(best, 1)[0] : null;
      let stillSince: number | null = null;
      // The smoothed centre is what the speed is measured on; the raw one still does matching.
      let sx = cx;
      let sy = cy;
      if (prev) {
        const seconds = Math.max(1, now - prev.t) / 1000;
        const alpha = Math.min(1, (seconds * 1000) / STILL_SMOOTH_MS);
        sx = prev.sx + alpha * (cx - prev.sx);
        sy = prev.sy + alpha * (cy - prev.sy);
        const speed = Math.hypot(sx - prev.sx, sy - prev.sy) / seconds;
        stillSince = speed <= STILL_MAX_SPEED ? (prev.stillSince ?? prev.t) : null;
      }
      next.push({ cx, cy, t: now, stillSince, sx, sy });
      people.push({
        box: found.box,
        posture: postureOf(lm),
        stillMs: stillSince === null ? 0 : now - stillSince,
        confidence: found.confidence,
      });
    }
    for (const tr of free) if (now - tr.t <= TRACK_KEEP_MS) next.push(tr);
    this.tracks = next;
    return { people };
  }

  reset(): void {
    this.tracks = [];
  }
}
