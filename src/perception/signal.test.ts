import { describe, expect, it } from 'vitest';
import {
  ConfidenceGate,
  Ema,
  GUIDANCE,
  PeakDetector,
  cameraGuidance,
  isActive,
  meanRecoil,
  rateByCount,
  rateFromPeaks,
  recoilRatios,
} from './signal';

/** Feeds a synthetic shoulder-y signal (pushes make y larger) through EMA + detector. */
function synth(
  det: PeakDetector,
  o: { bpm: number; seconds: number; fps?: number; amp?: number; noise?: number; start?: number; ema?: Ema },
): number {
  const fps = o.fps ?? 30;
  const amp = o.amp ?? 0.03;
  const noise = o.noise ?? 0.0015;
  const ema = o.ema ?? new Ema(0.3);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  let t = o.start ?? 0;
  const n = Math.round(o.seconds * fps);
  for (let i = 0; i < n; i++) {
    const phase = (t / 1000) * (o.bpm / 60) * 2 * Math.PI;
    const y = 0.4 + amp * (0.5 - 0.5 * Math.cos(phase)) + noise * rnd();
    det.push(t, ema.push(y));
    t += 1000 / fps;
  }
  return t;
}

function flat(det: PeakDetector, seconds: number, start: number, y = 0.4, fps = 30): number {
  let t = start;
  for (let i = 0; i < seconds * fps; i++) {
    det.push(t, y);
    t += 1000 / fps;
  }
  return t;
}

describe('PeakDetector + rate', () => {
  it.each([80, 100, 110, 120, 130])('tracks %i per minute within 4', (bpm) => {
    const det = new PeakDetector(0.008, 250);
    const end = synth(det, { bpm, seconds: 12 });
    const rate = rateFromPeaks(det.peakTimes(), end);
    expect(rate).not.toBeNull();
    expect(Math.abs((rate ?? 0) - bpm)).toBeLessThanOrEqual(4);
    expect(isActive(det.peakTimes(), end)).toBe(true);
    const byCount = rateByCount(det.peakTimes(), end);
    expect(Math.abs((byCount ?? 0) - bpm)).toBeLessThanOrEqual(8);
  });

  it('is null until five pushes have been seen', () => {
    const det = new PeakDetector(0.008, 250);
    const end = synth(det, { bpm: 110, seconds: 2 });
    expect(det.peakTimes().length).toBeLessThan(5);
    expect(rateFromPeaks(det.peakTimes(), end)).toBeNull();
  });

  it('does not count sub-threshold jitter as pushes', () => {
    const det = new PeakDetector(0.008, 250);
    const end = synth(det, { bpm: 110, seconds: 10, amp: 0.004, noise: 0.0005 });
    expect(det.peakTimes().length).toBe(0);
    expect(rateFromPeaks(det.peakTimes(), end)).toBeNull();
    expect(isActive(det.peakTimes(), end)).toBe(false);
  });

  it('discards a second peak inside the refractory period', () => {
    const det = new PeakDetector(0.008, 250);
    const seq: [number, number][] = [
      [0, 0.4],
      [33, 0.41],
      [66, 0.43], // first peak
      [99, 0.418], // falls by > prominence: peak confirmed
      [132, 0.428], // rises by > prominence: trough confirmed, seeking peak again
      [165, 0.432], // second candidate, 99 ms after the first
      [198, 0.42], // confirmed but inside refractory: discarded
      [500, 0.4],
      [533, 0.41],
    ];
    for (const [t, y] of seq) det.push(t, y);
    expect(det.peakTimes()).toEqual([66]);
  });

  it('goes inactive within 2 s of stopping and loses the rate after 10 s', () => {
    const det = new PeakDetector(0.008, 250);
    let t = synth(det, { bpm: 110, seconds: 12 });
    expect(isActive(det.peakTimes(), t)).toBe(true);
    t = flat(det, 2.5, t);
    expect(isActive(det.peakTimes(), t)).toBe(false);
    expect(rateFromPeaks(det.peakTimes(), t)).not.toBeNull();
    t = flat(det, 8, t);
    expect(rateFromPeaks(det.peakTimes(), t)).toBeNull();
  });

  it('caps the reported rate at 160', () => {
    const det = new PeakDetector(0.008, 250);
    const end = synth(det, { bpm: 200, seconds: 12, fps: 60 });
    const rate = rateFromPeaks(det.peakTimes(), end);
    expect(rate).not.toBeNull();
    expect(rate ?? 0).toBeLessThanOrEqual(160);
  });

  it('reports full recoil for a clean sine and partial recoil from hand-built cycles', () => {
    const det = new PeakDetector(0.008, 250);
    const end = synth(det, { bpm: 110, seconds: 12, noise: 0 });
    const r = meanRecoil(det.peakList(), det.troughList(), end);
    expect(r).not.toBeNull();
    expect(r ?? 0).toBeGreaterThan(0.9);

    const ratios = recoilRatios(
      [{ t: 1000, y: 0.43 }],
      [
        { t: 500, y: 0.4 },
        { t: 1500, y: 0.415 },
      ],
    );
    expect(ratios).toHaveLength(1);
    expect(ratios[0].t).toBe(1000);
    expect(ratios[0].ratio).toBeCloseTo(0.5, 6);
  });
});

describe('ConfidenceGate', () => {
  it('needs a sustained drop to go blind and a short recovery to come back', () => {
    const g = new ConfidenceGate(0.5, 1000, 300);
    expect(g.update(0.9, 0)).toEqual({ emitted: 0.9, blind: false });
    expect(g.update(0.2, 100)).toEqual({ emitted: 0.5, blind: false });
    expect(g.update(0.2, 600)).toEqual({ emitted: 0.5, blind: false });
    expect(g.update(0.2, 1150)).toEqual({ emitted: 0.2, blind: true });
    expect(g.update(0.9, 1200)).toEqual({ emitted: 0.9, blind: true });
    expect(g.update(0.9, 1550)).toEqual({ emitted: 0.9, blind: false });
  });

  it('a brief good frame does not reset the low timer', () => {
    const g = new ConfidenceGate(0.5, 1000, 300);
    g.update(0.2, 0);
    g.update(0.7, 500); // one good frame, well under the 300 ms recovery
    expect(g.update(0.2, 600).blind).toBe(false);
    expect(g.update(0.2, 1050).blind).toBe(true);
  });

  it('flicker around the threshold still ends in blind mode', () => {
    const g = new ConfidenceGate(0.5, 1000, 300);
    let blind = false;
    for (let t = 0; t <= 1500; t += 33) blind = g.update(t % 66 === 0 ? 0.45 : 0.55, t).blind;
    expect(blind).toBe(true);
  });
});

describe('cameraGuidance', () => {
  it('explains darkness before anything else once the shoulders are gone', () => {
    expect(cameraGuidance({ now: 5000, shouldersSeenAt: 1000, span: null, luma: 20 })).toBe(GUIDANCE.dark);
    expect(cameraGuidance({ now: 5000, shouldersSeenAt: 1000, span: null, luma: 120 })).toBe(GUIDANCE.unseen);
    expect(cameraGuidance({ now: 5000, shouldersSeenAt: null, span: null, luma: null })).toBe(GUIDANCE.unseen);
  });
  it('waits three seconds before complaining', () => {
    expect(cameraGuidance({ now: 3000, shouldersSeenAt: 1000, span: 0.2, luma: 120 })).toBeNull();
  });
  it('asks for distance changes from the shoulder span', () => {
    expect(cameraGuidance({ now: 1000, shouldersSeenAt: 1000, span: 0.05, luma: 120 })).toBe(GUIDANCE.closer);
    expect(cameraGuidance({ now: 1000, shouldersSeenAt: 1000, span: 0.6, luma: 120 })).toBe(GUIDANCE.back);
    expect(cameraGuidance({ now: 1000, shouldersSeenAt: 1000, span: 0.2, luma: 120 })).toBeNull();
  });
});
