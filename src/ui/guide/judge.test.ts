import { describe, expect, it } from 'vitest';
import type { PerceptionFacts } from '../../types';
import { emphasisFrom, judge, rateBandOf } from './judge';

const facts = (patch: Partial<PerceptionFacts> = {}): PerceptionFacts => ({
  t: 0,
  poseConfidence: 0.9,
  compressionRate: 110,
  compressionActive: true,
  recoilRatio: 0.8,
  handsOnRegion: true,
  handsOffMs: 0,
  ...patch,
});

describe('judge', () => {
  it('knows nothing without facts', () => {
    expect(judge(null)).toMatchObject({ hasFacts: false, rateBand: 'unknown', rate: null, active: false, recoilOk: null, visible: false, handsOn: null });
    expect(judge(facts()).hasFacts).toBe(true);
  });

  it('bands the rate on the docs/02 thresholds', () => {
    expect(rateBandOf(99)).toBe('low');
    expect(rateBandOf(100)).toBe('ok');
    expect(rateBandOf(120)).toBe('ok');
    expect(rateBandOf(121)).toBe('fast');
    expect(rateBandOf(125)).toBe('fast');
    expect(rateBandOf(126)).toBe('high');
    expect(rateBandOf(null)).toBe('unknown');
  });

  it('hides every derived metric when the pose is not trusted', () => {
    const j = judge(facts({ poseConfidence: 0.4 }));
    expect(j.visible).toBe(false);
    expect(j.rate).toBeNull();
    expect(j.active).toBe(false);
    expect(j.recoilOk).toBeNull();
    expect(j.handsOn).toBeNull();
  });

  it('reads recoil against the correction threshold', () => {
    expect(judge(facts({ recoilRatio: 0.59 })).recoilOk).toBe(false);
    expect(judge(facts({ recoilRatio: 0.6 })).recoilOk).toBe(true);
    expect(judge(facts({ recoilRatio: null })).recoilOk).toBeNull();
  });

  it('maps the engine dedupe keys to an emphasis and ignores the rest', () => {
    expect(emphasisFrom({ priority: 'critical', text: 'x', stateId: 'compressions', dedupeKey: 'rate-low' })).toBe('rate-low');
    expect(emphasisFrom({ priority: 'narration', text: 'x', stateId: 'compressions', dedupeKey: 'swap' })).toBeNull();
    expect(emphasisFrom({ priority: 'narration', text: 'x', stateId: 'compressions' })).toBeNull();
    expect(emphasisFrom(null)).toBeNull();
  });
});
