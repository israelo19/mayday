import { describe, expect, it } from 'vitest';
import { beatPeriodMs, beatPhase, compressionDepth } from './beat';

describe('beat math', () => {
  it('is 0 on the tick and wraps within a period', () => {
    expect(beatPhase(0, 120)).toBe(0);
    expect(beatPhase(250, 120)).toBeCloseTo(0.5);
    expect(beatPhase(500, 120)).toBeCloseTo(0);
    expect(beatPhase(1_250, 120)).toBeCloseTo(0.5);
  });

  it('honors the beat origin and negative times', () => {
    expect(beatPhase(1_100, 120, 1_000)).toBeCloseTo(0.2);
    expect(beatPhase(-100, 120)).toBeCloseTo(0.8);
  });

  it('puts the chest fully down on the tick and fully up between ticks', () => {
    expect(compressionDepth(0)).toBeCloseTo(1);
    expect(compressionDepth(0.5)).toBeCloseTo(0);
    expect(compressionDepth(0.25)).toBeCloseTo(0.5);
  });

  it('rejects a non-positive rate', () => {
    expect(() => beatPhase(0, 0)).toThrow(RangeError);
    expect(() => beatPeriodMs(-1)).toThrow(RangeError);
    expect(beatPeriodMs(110)).toBeCloseTo(545.45, 1);
  });
});
