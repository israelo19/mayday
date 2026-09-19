// Derived metrics, folded out of the event log. The engine logs a metric sample on every
// edge that matters plus a slow heartbeat, so each sample describes the interval until the
// next one. Blind intervals are counted as unmeasured, never as a pause: telling a paramedic
// "you stopped for 14 seconds" when the camera was covered would be a false claim.
import type { EventData, EventLogEntry, SitrepMetrics } from '../types';

const LONG_PAUSE_MS = 10000;

type MetricSample = Extract<EventData, { type: 'metric' }> & { t: number };
type Interval = MetricSample & { until: number };

export const EMPTY_METRICS: SitrepMetrics = {
  cprStartedAt: null,
  averageRate: null,
  compressionPauses: 0,
  longestPauseMs: 0,
  continuousPressureMs: 0,
  totalPressureMs: 0,
  unmeasuredMs: 0,
};

export function deriveMetrics(entries: readonly EventLogEntry[], now: number): SitrepMetrics {
  const intervals = toIntervals(entries, now);
  if (intervals.length === 0) return { ...EMPTY_METRICS, cprStartedAt: compressionsEnteredAt(entries) };

  // The compressions state is when we started coaching CPR. Oscillation during scene_check
  // or position is not a start: telling a dispatcher "I started CPR" before that state is a
  // false claim.
  const cprStartedAt = compressionsEnteredAt(entries);

  const rates = intervals.filter((i) => i.compressionActive && i.rate !== null).map((i) => i.rate as number);
  const averageRate = rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;

  let compressionPauses = 0;
  let longestPauseMs = 0;
  let unmeasuredMs = 0;
  let continuousPressureMs = 0;
  let totalPressureMs = 0;
  let pause = 0;
  let pressure = 0;

  for (const i of intervals) {
    const span = Math.max(0, i.until - i.t);
    if (i.blind) {
      unmeasuredMs += span;
      // Unknown, so it neither extends nor ends a pause.
      continue;
    }
    if (cprStartedAt !== null && i.t >= cprStartedAt && !i.compressionActive) {
      pause += span;
      longestPauseMs = Math.max(longestPauseMs, pause);
    } else if (i.compressionActive) {
      if (pause > LONG_PAUSE_MS) compressionPauses += 1;
      pause = 0;
    }
    if (i.handsOnRegion === true) {
      pressure += span;
      totalPressureMs += span;
      continuousPressureMs = Math.max(continuousPressureMs, pressure);
    } else if (i.handsOnRegion === false) {
      pressure = 0;
    }
  }
  if (pause > LONG_PAUSE_MS) compressionPauses += 1;

  return {
    cprStartedAt,
    averageRate,
    compressionPauses,
    longestPauseMs,
    continuousPressureMs,
    totalPressureMs,
    unmeasuredMs,
  };
}

/** First moment the app was in a machine that gives medical instructions. */
export function startedAt(entries: readonly EventLogEntry[]): number | null {
  const first = entries.find((e) => e.data?.type === 'state_enter' && e.data.machineId !== 'triage');
  return first?.t ?? null;
}

export function currentStateKey(entries: readonly EventLogEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const data = entries[i].data;
    if (data?.type === 'state_enter') return `${data.machineId}.${data.stateId}`;
  }
  return 'not started';
}

export function activeMachine(entries: readonly EventLogEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const data = entries[i].data;
    if (data?.type === 'state_enter' && data.machineId !== 'triage') return data.machineId;
  }
  return null;
}

function compressionsEnteredAt(entries: readonly EventLogEntry[]): number | null {
  const entry = entries.find(
    (e) => e.data?.type === 'state_enter' && e.data.machineId === 'cardiac' && e.data.stateId === 'compressions',
  );
  return entry?.t ?? null;
}

function toIntervals(entries: readonly EventLogEntry[], now: number): Interval[] {
  const samples: MetricSample[] = [];
  for (const e of entries) {
    if (e.data?.type === 'metric') samples.push({ ...e.data, t: e.t });
  }
  return samples.map((s, i) => ({ ...s, until: samples[i + 1]?.t ?? now }));
}
