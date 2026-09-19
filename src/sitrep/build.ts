// Builders for the two report surfaces. Every line here is a statement of recorded fact.
// When something was not measured we say so rather than rounding it into a claim.
import type { EventLogEntry, GeoFix, HandoffReport, Sitrep } from '../types';
import { activeMachine, currentStateKey, deriveMetrics, startedAt } from './derive';
import type { EventLog } from './log';

const EMERGENCY: Record<string, string> = {
  cardiac: 'Cardiac arrest, not breathing. CPR in progress.',
  bleeding: 'Severe bleeding. Direct pressure in progress.',
  choking: 'Choking, airway blocked.',
};

export function buildSitrep(log: EventLog, geo: GeoFix | null, now: number): Sitrep {
  const entries = log.entries();
  const began = startedAt(entries);
  const metrics = deriveMetrics(entries, now);
  const machine = activeMachine(entries);
  const emergency = machine ? EMERGENCY[machine] : 'Medical emergency, not yet identified.';
  return {
    t: now,
    location: geo,
    emergency: emergency ?? 'Medical emergency.',
    startedAt: began,
    elapsedMs: began === null ? 0 : now - began,
    currentState: currentStateKey(entries),
    metrics,
    readAloud: readAloud(geo, emergency ?? 'Medical emergency.', began, metrics, machine, now),
    timeline: entries,
  };
}

export function buildHandoff(log: EventLog, now: number, geo: GeoFix | null = null): HandoffReport {
  const entries = log.entries();
  const began = startedAt(entries);
  const metrics = deriveMetrics(entries, now);
  const machine = activeMachine(entries);
  return {
    generatedAt: now,
    emergency: (machine ? EMERGENCY[machine] : undefined) ?? 'Medical emergency.',
    startedAt: began,
    durationMs: began === null ? 0 : now - began,
    location: geo,
    metrics,
    headline: headline(metrics, began, now, machine),
    timeline: entries,
  };
}

/** Short declarative lines, in the order a dispatcher asks for them. */
function readAloud(
  geo: GeoFix | null,
  emergency: string,
  began: number | null,
  metrics: ReturnType<typeof deriveMetrics>,
  machine: string | null,
  now: number,
): string[] {
  const lines: string[] = [];
  lines.push(
    geo
      ? geo.address
        ? `My location is ${geo.address}.`
        : `My location is ${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}.`
      : 'I do not have a location fix. I will describe where I am.',
  );
  lines.push(emergency);
  if (began !== null) lines.push(`This started ${formatDuration(now - began)} ago.`);
  if (machine === 'cardiac' && metrics.cprStartedAt !== null) {
    lines.push(`I started CPR ${formatDuration(now - metrics.cprStartedAt)} ago.`);
    if (metrics.averageRate !== null) lines.push(`Compressions are averaging ${metrics.averageRate} a minute.`);
    lines.push(
      metrics.longestPauseMs > 10000
        ? `My longest pause was ${formatDuration(metrics.longestPauseMs)}.`
        : 'I have not stopped for more than ten seconds.',
    );
  }
  if (machine === 'bleeding' && metrics.continuousPressureMs > 0) {
    lines.push(`I have held pressure for ${formatDuration(metrics.continuousPressureMs)}.`);
  }
  return lines;
}

function headline(
  metrics: ReturnType<typeof deriveMetrics>,
  began: number | null,
  now: number,
  machine: string | null,
): string[] {
  const lines: string[] = [];
  if (began !== null) lines.push(`Bystander care: ${formatDuration(now - began)}`);
  if (machine === 'cardiac') {
    lines.push(metrics.cprStartedAt === null ? 'CPR: not started' : `CPR started: ${clock(metrics.cprStartedAt)}`);
    lines.push(metrics.averageRate === null ? 'Average rate: not measured' : `Average rate: ${metrics.averageRate}/min`);
    lines.push(`Pauses over 10s: ${metrics.compressionPauses}`);
    lines.push(`Longest pause: ${formatDuration(metrics.longestPauseMs)}`);
  }
  if (machine === 'bleeding') {
    lines.push(`Longest unbroken pressure: ${formatDuration(metrics.continuousPressureMs)}`);
    lines.push(`Total pressure: ${formatDuration(metrics.totalPressureMs)}`);
  }
  if (metrics.unmeasuredMs > 0) lines.push(`Not measured (camera blocked): ${formatDuration(metrics.unmeasuredMs)}`);
  return lines;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} seconds`;
  if (seconds === 0) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return `${minutes} minute${minutes === 1 ? '' : 's'} ${seconds} seconds`;
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function handoffJson(report: HandoffReport): string {
  return JSON.stringify(report, null, 2);
}

/** QR codes top out near 3 KB, so the scanned payload keeps the metrics and trims the timeline. */
export function handoffQrPayload(report: HandoffReport, maxChars = 2000): string {
  const compact = {
    v: 1,
    at: report.generatedAt,
    emergency: report.emergency,
    durationMs: report.durationMs,
    location: report.location,
    metrics: report.metrics,
    timeline: significant(report.timeline).map((e) => [e.t, e.kind, e.detail] as const),
  };
  let payload = JSON.stringify(compact);
  while (payload.length > maxChars && compact.timeline.length > 0) {
    compact.timeline.splice(Math.floor(compact.timeline.length / 2), 1);
    payload = JSON.stringify(compact);
  }
  return payload;
}

/** Metric heartbeats are noise on a printed timeline; state changes and spoken lines are not. */
function significant(timeline: readonly EventLogEntry[]): EventLogEntry[] {
  return timeline.filter((e) => e.kind !== 'metric');
}
