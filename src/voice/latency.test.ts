// The numbers on the latency slide come from this code path; it had better be right.
import { describe, expect, it } from 'vitest';
import { createLatencyLog } from './latency';

describe('latency log', () => {
  it('summarizes empty as nulls, never NaN', () => {
    const log = createLatencyLog();
    expect(log.stats().all).toEqual({ count: 0, p50: null, p95: null, worst: null });
  });

  it('computes p50, p95 and worst per kind and overall', () => {
    const log = createLatencyLog();
    for (let i = 1; i <= 100; i++) log.record('correction', i * 10); // 10..1000
    log.record('critical', 5000);
    const s = log.stats();
    expect(s.byKind['correction'].p50).toBe(500);
    expect(s.byKind['correction'].p95).toBe(950);
    expect(s.byKind['correction'].worst).toBe(1000);
    expect(s.byKind['critical'].count).toBe(1);
    expect(s.all.worst).toBe(5000);
    expect(s.all.count).toBe(101);
  });

  it('drops the oldest samples past capacity', () => {
    const log = createLatencyLog(3);
    for (const ms of [1, 2, 3, 4]) log.record('x', ms);
    expect(log.samples().map((s) => s.ms)).toEqual([2, 3, 4]);
  });
});
