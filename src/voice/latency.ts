// Latency instrumentation, docs/07 P3 task 4. The stage claims are "correction audible
// within 1 s of the triggering fact" and "blind line within 2 s of covering the lens";
// this module is how those numbers get measured instead of asserted. Samples come from
// the queue's onSpoken hook (fact time -> utterance start), stats go to the debug panel,
// and the phone-run results are written down in docs/latency.md with N and conditions.
// Pure: no clock of its own, no DOM, no network. Owned by P3 (docs/07).

export type LatencySample = {
  /** CoachingEvent priority, so critical and correction budgets read separately. */
  kind: string;
  /** Fact timestamp -> audio start, in ms. */
  ms: number;
};

export type LatencySummary = {
  count: number;
  p50: number | null;
  p95: number | null;
  worst: number | null;
};

export type LatencyStats = {
  all: LatencySummary;
  byKind: Record<string, LatencySummary>;
};

export interface LatencyLog {
  record(kind: string, ms: number): void;
  stats(): LatencyStats;
  samples(): readonly LatencySample[];
}

/** Nearest-rank percentile on a sorted copy; null when there is nothing to summarize. */
function summarize(values: number[]): LatencySummary {
  if (values.length === 0) return { count: 0, p50: null, p95: null, worst: null };
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  return {
    count: sorted.length,
    p50: rank(50),
    p95: rank(95),
    worst: sorted[sorted.length - 1],
  };
}

export function createLatencyLog(capacity = 200): LatencyLog {
  const ring: LatencySample[] = [];
  return {
    record(kind: string, ms: number): void {
      // A negative sample means a clock went backwards; keep it visible rather than hide it.
      ring.push({ kind, ms });
      while (ring.length > capacity) ring.shift();
    },
    stats(): LatencyStats {
      const byKind: Record<string, LatencySummary> = {};
      const kinds = new Set(ring.map((s) => s.kind));
      for (const kind of kinds) byKind[kind] = summarize(ring.filter((s) => s.kind === kind).map((s) => s.ms));
      return { all: summarize(ring.map((s) => s.ms)), byKind };
    },
    samples(): readonly LatencySample[] {
      return ring;
    },
  };
}
