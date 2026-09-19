import { describe, expect, it } from 'vitest';
import { boxOf, postureOf, SceneTracker, STILL_MAX_SPEED, TRACK_KEEP_MS } from './scene';
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
});
