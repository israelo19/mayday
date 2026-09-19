import { describe, expect, it } from 'vitest';
import { ChokingGestureDetector, RoiTracker, type Hand } from './roi';

const FRAME = 33;
const pair = (x: number, y: number): Hand[] => [
  { cx: x, cy: y, width: 0.06 },
  { cx: x + 0.03, cy: y, width: 0.06 },
];

function feed(tr: RoiTracker, hands: Hand[] | ((t: number) => Hand[]), fromMs: number, forMs: number) {
  let t = fromMs;
  let last = tr.snapshot();
  while (t < fromMs + forMs) {
    last = tr.update(typeof hands === 'function' ? hands(t) : hands, t);
    t += FRAME;
  }
  return { roi: last, t };
}

describe('RoiTracker', () => {
  it('locks after the hands hold still for 1.5 s, then tracks on and off', () => {
    const tr = new RoiTracker();
    tr.lock(0);
    let r = feed(tr, pair(0.5, 0.55), 0, 1000);
    expect(r.roi.state).toBe('locking');
    r = feed(tr, pair(0.5, 0.55), r.t, 800);
    expect(r.roi.state).toBe('locked');
    expect(r.roi.r).toBeGreaterThanOrEqual(0.08);
    expect(r.roi.handsOn).toBe(true);
    expect(r.roi.handsOffMs).toBe(0);

    // lift both hands to peek
    r = feed(tr, pair(0.5, 0.2), r.t, 2000);
    expect(r.roi.handsOn).toBe(false);
    expect(r.roi.handsOffMs).toBeGreaterThan(1900);
    expect(r.roi.handsOffMs).toBeLessThan(2100);

    // back on the wound
    r = feed(tr, pair(0.5, 0.55), r.t, 100);
    expect(r.roi.handsOn).toBe(true);
    expect(r.roi.handsOffMs).toBe(0);
  });

  it('keeps the last state through a short detection gap, then counts as off', () => {
    const tr = new RoiTracker();
    tr.lock(0);
    let r = feed(tr, pair(0.5, 0.55), 0, 1800);
    expect(r.roi.state).toBe('locked');
    r = feed(tr, [], r.t, 500);
    expect(r.roi.handsOn).toBe(true);
    r = feed(tr, [], r.t, 600);
    expect(r.roi.handsOn).toBe(false);
  });

  it('fails after 10 s without steady hands and reports nothing', () => {
    const tr = new RoiTracker();
    tr.lock(0);
    const wander = (t: number) => pair(0.3 + 0.3 * Math.sin(t / 200), 0.5);
    const r = feed(tr, wander, 0, 10_500);
    expect(r.roi.state).toBe('failed');
    expect(r.roi.handsOn).toBeNull();
    expect(r.roi.handsOffMs).toBeNull();
  });

  it('unlock returns to idle', () => {
    const tr = new RoiTracker();
    tr.lock(0);
    feed(tr, pair(0.5, 0.55), 0, 1800);
    tr.unlock();
    expect(tr.snapshot().state).toBe('idle');
  });
});

describe('ChokingGestureDetector', () => {
  const neck = { x: 0.5, y: 0.3, span: 0.2 };
  it('needs both hands at the throat for 1.5 s', () => {
    const d = new ChokingGestureDetector();
    const hands = pair(0.48, 0.32);
    expect(d.update(hands, neck, 0)).toBe(false);
    expect(d.update(hands, neck, 1000)).toBe(false);
    expect(d.update(hands, neck, 1600)).toBe(true);
  });
  it('resets when a hand leaves', () => {
    const d = new ChokingGestureDetector();
    const hands = pair(0.48, 0.32);
    d.update(hands, neck, 0);
    d.update([hands[0]], neck, 800);
    expect(d.update(hands, neck, 1600)).toBe(false);
  });
});
