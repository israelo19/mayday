import { describe, expect, it } from 'vitest';
import { createEngine, machines } from '../src/protocol';
import { FakeFacts } from '../src/perception/fake';
import { buildHandoff, buildSitrep, createEventLog, handoffQrPayload, formatDuration } from '../src/sitrep';
import type { GeoFix } from '../src/types';

const T0 = 1_700_000_000_000;
const GEO: GeoFix = { lat: 39.32899, lon: -76.62049 };

/** A session driven exactly as src/session.ts will drive it: facts in, log out. */
function session(machineId: string, stateId?: string, controls = {}) {
  const log = createEventLog();
  const engine = createEngine(machines);
  engine.subscribe((out) => {
    if (out.type === 'log') log.append(out.entry);
  });
  engine.tick(T0);
  engine.start(machineId, stateId);
  const facts = new FakeFacts(controls);
  let now = T0;
  return {
    log,
    facts,
    now: () => now,
    run(toMs: number, stepMs = 500) {
      for (let t = now + stepMs; t <= T0 + toMs; t += stepMs) {
        engine.onFacts(facts.at(t));
        engine.tick(t);
        now = t;
      }
    },
  };
}

describe('derived metrics', () => {
  it('reports when CPR started and how fast it has been', () => {
    const s = session('cardiac', 'compressions', { rate: 112 });
    s.run(60000);
    const sitrep = buildSitrep(s.log, GEO, s.now());
    expect(sitrep.metrics.cprStartedAt).toBe(T0);
    expect(sitrep.metrics.averageRate).toBe(112);
  });

  it('counts a pause over ten seconds and remembers the longest', () => {
    const s = session('cardiac', 'compressions', { rate: 110 });
    s.run(10000);
    s.facts.set({ compressing: false });
    s.run(25000);
    s.facts.set({ compressing: true });
    s.run(35000);
    const { metrics } = buildSitrep(s.log, GEO, s.now());
    expect(metrics.compressionPauses).toBe(1);
    expect(metrics.longestPauseMs).toBeGreaterThanOrEqual(14000);
    expect(metrics.longestPauseMs).toBeLessThanOrEqual(16000);
  });

  it('does not count a short pause', () => {
    const s = session('cardiac', 'compressions', { rate: 110 });
    s.run(10000);
    s.facts.set({ compressing: false });
    s.run(14000);
    s.facts.set({ compressing: true });
    s.run(20000);
    expect(buildSitrep(s.log, GEO, s.now()).metrics.compressionPauses).toBe(0);
  });

  it('calls blind time unmeasured rather than telling a paramedic the bystander stopped', () => {
    const s = session('cardiac', 'compressions', { rate: 110 });
    s.run(10000);
    s.facts.set({ cameraCovered: true });
    s.run(40000);
    const { metrics } = buildSitrep(s.log, GEO, s.now());
    expect(metrics.unmeasuredMs).toBeGreaterThanOrEqual(29000);
    expect(metrics.compressionPauses).toBe(0);
    expect(metrics.longestPauseMs).toBe(0);
  });

  it('times unbroken pressure on a wound', () => {
    const s = session('bleeding', 'pressure', { handsOn: true, compressing: false });
    s.run(40000);
    s.facts.set({ handsOn: false });
    s.run(45000);
    s.facts.set({ handsOn: true });
    s.run(60000);
    const { metrics } = buildSitrep(s.log, null, s.now());
    expect(metrics.continuousPressureMs).toBeGreaterThanOrEqual(39000);
    expect(metrics.totalPressureMs).toBeGreaterThan(metrics.continuousPressureMs);
  });
});

describe('what the bystander reads to the dispatcher', () => {
  it('leads with coordinates when there is a fix', () => {
    const s = session('cardiac', 'compressions', { rate: 110 });
    s.run(30000);
    const sitrep = buildSitrep(s.log, GEO, s.now());
    expect(sitrep.readAloud[0]).toBe('My location is 39.32899, -76.62049.');
    expect(sitrep.readAloud[1]).toContain('Cardiac arrest');
    expect(sitrep.readAloud.join(' ')).toContain('110 a minute');
  });

  it('admits it has no fix rather than inventing one', () => {
    const s = session('cardiac', 'compressions');
    s.run(5000);
    expect(buildSitrep(s.log, null, s.now()).readAloud[0]).toContain('do not have a location fix');
  });

  it('says plainly that there has been no long pause', () => {
    const s = session('cardiac', 'compressions', { rate: 110 });
    s.run(30000);
    expect(buildSitrep(s.log, GEO, s.now()).readAloud.join(' ')).toContain('not stopped for more than ten seconds');
  });

  it('does not claim they never paused before CPR has started', () => {
    const s = session('cardiac', 'scene_check');
    s.run(5000);
    const text = buildSitrep(s.log, GEO, s.now()).readAloud.join(' ');
    expect(text).not.toContain('not stopped for more than ten seconds');
    expect(text).not.toContain('I started CPR');
  });
});

describe('handoff report', () => {
  it('headlines the metrics a paramedic asks for', () => {
    const s = session('cardiac', 'compressions', { rate: 118 });
    s.run(90000);
    const report = buildHandoff(s.log, s.now(), GEO);
    expect(report.headline.join('\n')).toContain('Average rate: 118/min');
    expect(report.headline.join('\n')).toContain('Pauses over 10s: 0');
    expect(report.emergency).toContain('Cardiac arrest');
  });

  it('packs into a QR payload small enough to scan and still parse', () => {
    const s = session('cardiac', 'compressions', { rate: 110 });
    s.run(600000, 1000);
    const payload = handoffQrPayload(buildHandoff(s.log, s.now(), GEO));
    expect(payload.length).toBeLessThanOrEqual(2000);
    const parsed = JSON.parse(payload) as { metrics: { averageRate: number } };
    expect(parsed.metrics.averageRate).toBe(110);
  });

  it('starts the clock at the first medical instruction, not at triage', () => {
    const log = createEventLog();
    const engine = createEngine(machines);
    engine.subscribe((out) => out.type === 'log' && log.append(out.entry));
    engine.tick(T0);
    engine.start('triage');
    engine.tick(T0 + 5000);
    engine.onKeyword('not breathing');
    const report = buildHandoff(log, T0 + 15000);
    expect(report.startedAt).toBe(T0 + 5000);
    expect(report.durationMs).toBe(10000);
  });
});

describe('spoken durations', () => {
  it('reads naturally', () => {
    expect(formatDuration(45000)).toBe('45 seconds');
    expect(formatDuration(60000)).toBe('1 minute');
    expect(formatDuration(200000)).toBe('3 minutes 20 seconds');
  });
});
