import { describe, expect, it } from 'vitest';
import { boxOf, postureOf, SceneTracker, STILL_MAX_SPEED, TRACK_KEEP_MS } from './scene';
import { headOf } from './signal';
import { LEFT_HIP, LEFT_SHOULDER, RIGHT_HIP, RIGHT_SHOULDER } from './signal';

type Pt = { x: number; y: number; visibility: number };

/** A 33-landmark pose from a shoulder midpoint and a hip midpoint; everything else sits between them. */
function pose(shoulders: [number, number], hips: [number, number], visibility = 0.9): Pt[] {
  const lm: Pt[] = [];
  for (let i = 0; i < 33; i++) {
    const f = i / 32;
    lm.push({ x: shoulders[0] + (hips[0] - shoulders[0]) * f, y: shoulders[1] + (hips[1] - shoulders[1]) * f, visibility });
  }
  lm[LEFT_SHOULDER] = { x: shoulders[0] - 0.05, y: shoulders[1], visibility };
  lm[RIGHT_SHOULDER] = { x: shoulders[0] + 0.05, y: shoulders[1], visibility };
  lm[LEFT_HIP] = { x: hips[0] - 0.05, y: hips[1], visibility };
  lm[RIGHT_HIP] = { x: hips[0] + 0.05, y: hips[1], visibility };
  return lm;
}

const lying = () => pose([0.3, 0.6], [0.6, 0.6]);
const upright = () => pose([0.5, 0.3], [0.5, 0.6]);

describe('boxOf and postureOf', () => {
  it('boxes the visible landmarks and reads the torso angle', () => {
    const b = boxOf(lying());
    expect(b).not.toBeNull();
    expect(b!.box.x).toBeLessThan(0.3);
    expect(b!.box.x + b!.box.w).toBeGreaterThan(0.6);
    expect(postureOf(lying())).toBe('lying');
    expect(postureOf(upright())).toBe('upright');
    expect(postureOf(pose([0.5, 0.3], [0.7, 0.5]))).toBe('unknown'); // 45 degrees: neither
  });

  it('gives up on a pose it can barely see', () => {
    expect(boxOf(lying().map((p) => ({ ...p, visibility: 0.1 })))).toBeNull();
    expect(postureOf(lying().map((p) => ({ ...p, visibility: 0.4 })))).toBe('unknown');
  });
});

describe('SceneTracker', () => {
  it('counts how long a person has been still, and starts over when they move', () => {
    const tr = new SceneTracker();
    tr.update([lying()], 0);
    tr.update([lying()], 100);
    const still = tr.update([lying()], 2000);
    expect(still.people).toHaveLength(1);
    expect(still.people[0].posture).toBe('lying');
    expect(still.people[0].stillMs).toBe(2000);
    // A jump of 0.1 in 100 ms is 1.0 widths per second: moving.
    const moved = tr.update([pose([0.4, 0.6], [0.7, 0.6])], 2100);
    expect(moved.people[0].stillMs).toBe(0);
  });

  it('keeps two people apart', () => {
    const tr = new SceneTracker();
    tr.update([lying(), upright()], 0);
    const seen = tr.update([upright(), lying()], 500); // order swapped, identity kept
    expect(seen.people.map((p) => p.posture).sort()).toEqual(['lying', 'upright']);
    for (const p of seen.people) expect(p.stillMs).toBe(500);
  });

  it('survives a dropped frame without resetting the count, and forgets after a second', () => {
    const tr = new SceneTracker();
    tr.update([lying()], 0);
    tr.update([], 300); // pose lost for one frame
    expect(tr.update([lying()], 600).people[0].stillMs).toBe(600);
    tr.update([], 700);
    tr.update([], 700 + TRACK_KEEP_MS + 100);
    expect(tr.update([lying()], 700 + TRACK_KEEP_MS + 200).people[0].stillMs).toBe(0);
  });

  it('treats slow drift as still', () => {
    const tr = new SceneTracker();
    tr.update([lying()], 0);
    const drift = STILL_MAX_SPEED * 0.5; // per second, over one second
    const seen = tr.update([pose([0.3 + drift, 0.6], [0.6 + drift, 0.6])], 1000);
    expect(seen.people[0].stillMs).toBe(1000);
  });

  /**
   * The regression the old tests could not see. Every other case here feeds a byte-identical
   * pose, so the centre moves exactly zero and the threshold is never really exercised; the
   * one moving case steps a whole second at a time. A real camera delivers a motionless
   * person as a jittering one thirty times a second, and that used to read "moving" forever.
   */
  it('reads a motionless person as still despite landmark jitter, at any frame rate', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const jittered = (amount: number) => {
      const j = () => (rnd() * 2 - 1) * amount;
      return pose([0.3 + j(), 0.6 + j()], [0.6 + j(), 0.6 + j()]);
    };
    for (const fps of [10, 30, 60]) {
      const tr = new SceneTracker();
      let best = 0;
      for (let f = 0; f < fps * 3; f++) best = Math.max(best, tr.update([jittered(0.005)], (f * 1000) / fps).people[0].stillMs);
      expect(best, `${fps} fps`).toBeGreaterThan(2000);
    }
  });

  it('still calls real movement moving, at any frame rate', () => {
    for (const fps of [10, 30, 60]) {
      const tr = new SceneTracker();
      let worst = Infinity;
      // 0.3 widths per second, six times the threshold: unmistakably walking.
      for (let f = 0; f < fps * 3; f++) {
        const x = (f / fps) * 0.3;
        worst = Math.min(worst, tr.update([pose([0.1 + x, 0.6], [0.4 + x, 0.6])], (f * 1000) / fps).people[0].stillMs);
      }
      expect(worst, `${fps} fps`).toBe(0);
    }
  });
});

describe('the head', () => {
  it('is estimated above the ears, so the box holds the whole person', () => {
    const lm = upright();
    // Ears either side of the nose, a little above the shoulders.
    lm[0] = { x: 0.5, y: 0.2, visibility: 0.9 };
    lm[7] = { x: 0.47, y: 0.2, visibility: 0.9 };
    lm[8] = { x: 0.53, y: 0.2, visibility: 0.9 };
    const head = headOf(lm);
    expect(head).not.toBeNull();
    // The crown sits above the ear line, which is what BlazePose never marks.
    expect(head!.cy - head!.r).toBeLessThan(0.2);
    const box = boxOf(lm);
    expect(box).not.toBeNull();
    expect(box!.box.y).toBeLessThanOrEqual(head!.cy - head!.r);
  });

  it('is never wider than the shoulders, however badly an ear is placed', () => {
    const lm = upright();
    lm[0] = { x: 0.5, y: 0.2, visibility: 0.9 };
    lm[7] = { x: 0.02, y: 0.2, visibility: 0.9 }; // an ear across the room
    lm[8] = { x: 0.98, y: 0.2, visibility: 0.9 };
    const span = Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y);
    expect(headOf(lm)!.r).toBeLessThanOrEqual(span * 0.75);
    // and the box it produces is still a person, not the whole frame
    expect(boxOf(lm)!.box.h).toBeLessThan(0.9);
  });

  it('refuses a NaN landmark instead of spreading it over the box', () => {
    const lm = upright();
    lm[0] = { x: 0.5, y: 0.2, visibility: 0.9 };
    lm[7] = { x: Number.NaN, y: Number.NaN, visibility: 0.9 };
    lm[8] = { x: 0.53, y: 0.2, visibility: 0.9 };
    expect(headOf(lm)).toBeNull();
    const box = boxOf(lm)!.box;
    for (const v of [box.x, box.y, box.w, box.h]) expect(Number.isFinite(v)).toBe(true);
  });

  it('is null when the shoulders are not visible, and never throws on a bare pose', () => {
    const hidden = upright().map((p) => ({ ...p, visibility: 0 }));
    expect(headOf(hidden)).toBeNull();
    expect(() => headOf(upright())).not.toThrow();
  });
});
