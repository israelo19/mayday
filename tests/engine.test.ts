import { describe, expect, it } from 'vitest';
import { harness, T0 } from './harness';
import { STALE_FACTS_MS } from '../src/protocol';

describe('coaching rules', () => {
  it('nags about a slow rate once per cooldown, not once per frame', () => {
    const h = harness('cardiac', 'compressions', { rate: 80 });
    h.run(0, 5000);
    expect(h.fired('rate-low')).toHaveLength(1);
    h.run(5100, 12000);
    expect(h.fired('rate-low')).toHaveLength(2);
  });

  it('corrects a fast rate', () => {
    const h = harness('cardiac', 'compressions', { rate: 140 });
    h.run(0, 5000);
    expect(h.fired('rate-high')[0].text).toContain('slower');
    expect(h.fired('rate-low')).toHaveLength(0);
  });

  it('says nothing about rate until perception has measured one', () => {
    // FakeFacts withholds a rate for the first 3s, exactly as the real module does.
    const h = harness('cardiac', 'compressions', { rate: 80 });
    h.run(0, 2500);
    expect(h.fired('rate-low')).toHaveLength(0);
  });

  it('calls out a stop only after three seconds of no compressions', () => {
    const h = harness('cardiac', 'compressions', { compressing: false });
    h.run(0, 2800);
    expect(h.fired('stopped')).toHaveLength(0);
    h.run(2900, 3200);
    expect(h.fired('stopped')).toHaveLength(1);
  });

  it('repeats the swap reminder every two minutes', () => {
    const h = harness('cardiac', 'compressions');
    h.run(0, 119000, 500);
    expect(h.fired('swap')).toHaveLength(0);
    h.run(119500, 121000, 500);
    expect(h.fired('swap')).toHaveLength(1);
  });
});

describe('blind mode', () => {
  it('announces blindness and suppresses every other rule', () => {
    const h = harness('cardiac', 'compressions', { rate: 80, cameraCovered: true });
    h.run(0, 20000);
    expect(h.fired('blind').length).toBeGreaterThan(0);
    expect(h.fired('rate-low')).toHaveLength(0);
    expect(h.fired('stopped')).toHaveLength(0);
    expect(h.fired('recoil')).toHaveLength(0);
  });

  it('speaks the blind line as critical but logs it as system, not medical advice', () => {
    const h = harness('cardiac', 'compressions', { cameraCovered: true });
    h.run(0, 1000);
    expect(h.fired('blind')[0].priority).toBe('critical');
    const logged = h.log().filter((e) => e.data?.type === 'coach' && e.data.dedupeKey === 'blind');
    expect(logged[0].kind).toBe('system');
  });

  it('holds the blind line to one every twenty seconds', () => {
    const h = harness('cardiac', 'compressions', { cameraCovered: true });
    h.run(0, 45000, 500);
    expect(h.fired('blind')).toHaveLength(3);
  });

  it('treats frozen facts as blindness, so a stale number never coaches', () => {
    const h = harness('cardiac', 'compressions', { rate: 80 });
    h.run(0, 4000);
    const before = h.fired('blind').length;
    h.idle(4100, 4000 + STALE_FACTS_MS + 500);
    expect(h.fired('blind').length).toBeGreaterThan(before);
  });

  it('does not cry blind before perception has had time to start', () => {
    const h = harness('cardiac', 'compressions');
    h.idle(0, 2000);
    expect(h.fired('blind')).toHaveLength(0);
  });
});

describe('transitions', () => {
  it('advances on a timer', () => {
    const h = harness('cardiac', 'call_911');
    h.idle(0, 7000, 500);
    expect(h.stateKey()).toBe('cardiac.call_911');
    h.idle(7500, 8500, 500);
    expect(h.stateKey()).toBe('cardiac.position');
  });

  it('never times out of scene safety, however long the bystander waits', () => {
    const h = harness('bleeding', 'scene_safety');
    h.idle(0, 120000, 1000);
    expect(h.stateKey()).toBe('bleeding.scene_safety');
  });

  it('starts compressions the moment perception sees them', () => {
    const h = harness('cardiac', 'position');
    h.run(0, 500);
    expect(h.stateKey()).toBe('cardiac.compressions');
  });

  it('will not take a fact transition while blind', () => {
    const h = harness('cardiac', 'position', { cameraCovered: true });
    h.run(0, 2000);
    expect(h.stateKey()).toBe('cardiac.position');
  });

  it('crosses machines from triage', () => {
    const h = harness('triage');
    h.engine.onKeyword("he's not breathing");
    expect(h.stateKey()).toBe('cardiac.scene_check');
  });

  it('routes a bleeding call to scene safety first, never straight to the wound', () => {
    const h = harness('triage');
    h.engine.onKeyword('he got shot');
    expect(h.stateKey()).toBe('bleeding.scene_safety');
  });

  it('sends an unconscious choking patient to CPR positioning', () => {
    const h = harness('choking', 'back_blows');
    h.engine.onKeyword('he passed out');
    expect(h.stateKey()).toBe('cardiac.position');
  });

  it('answers NEXT from every non-terminal state, so the demo cannot wedge', () => {
    for (const machineId of ['triage', 'cardiac', 'bleeding', 'choking']) {
      const h = harness(machineId);
      const before = h.stateKey();
      h.engine.advance();
      expect(h.stateKey(), `${machineId} ignored NEXT`).not.toBe(before);
    }
  });

  it('exposes a button twin for every keyword in the state', () => {
    const h = harness('cardiac', 'check_breathing');
    const twins = h.engine.availableTransitions();
    expect(twins.map((t) => t.keyword)).toContain('not breathing');
    expect(twins.every((t) => t.label.length > 0)).toBe(true);
  });
});

describe('bleeding', () => {
  it('shouts when the hands come off the wound', () => {
    const h = harness('bleeding', 'pressure', { handsOn: true });
    h.run(0, 2000);
    expect(h.fired('hands-off')).toHaveLength(0);
    h.facts.set({ handsOn: false });
    h.run(2100, 3400);
    expect(h.fired('hands-off')[0].text).toContain("Don't let go");
  });

  it('fires the hands-off line inside the promised second and a half', () => {
    const h = harness('bleeding', 'pressure', { handsOn: false });
    h.run(0, 1500);
    const fired = h.fired('hands-off');
    expect(fired).toHaveLength(1);
    expect(fired[0].t - T0).toBeLessThanOrEqual(1500);
  });

  it('encourages after thirty seconds of unbroken pressure', () => {
    const h = harness('bleeding', 'pressure', { handsOn: true });
    h.run(0, 29000, 500);
    expect(h.fired('encourage')).toHaveLength(0);
    h.run(29500, 31000, 500);
    expect(h.fired('encourage')).toHaveLength(1);
  });

  it('answers the word tourniquet without leaving the state or volunteering one', () => {
    const h = harness('bleeding', 'pressure', { handsOn: true });
    h.engine.onKeyword('should I use a tourniquet');
    expect(h.stateKey()).toBe('bleeding.pressure');
    expect(h.fired('answer:tourniquet')[0].text).toContain('two to three inches above the wound');
    const volunteered = h
      .coach()
      .filter((e) => e.dedupeKey !== 'answer:tourniquet' && e.text.toLowerCase().includes('tourniquet'));
    expect(volunteered).toHaveLength(0);
  });
});

describe('state entry', () => {
  it('speaks every line of the state it enters, in order', () => {
    const h = harness('cardiac', 'position');
    const spoken = h.coach().map((e) => e.text);
    expect(spoken[0]).toBe('Kneel beside his chest.');
    expect(spoken).toHaveLength(4);
  });

  it('reports the metronome tempo on entry and silence on leaving', () => {
    const h = harness('cardiac', 'compressions');
    const enters = h.outputs.flatMap((o) => (o.type === 'state_enter' ? [o] : []));
    expect(enters[0].metronome).toBe(110);
    h.engine.onKeyword('ambulance here');
    expect(h.outputs.flatMap((o) => (o.type === 'state_enter' ? [o] : [])).at(-1)?.metronome).toBeNull();
  });

  it('logs the transcript it heard, so the handoff shows what was said', () => {
    const h = harness('cardiac', 'compressions');
    h.engine.onKeyword('the ambulance here now');
    expect(h.log().some((e) => e.kind === 'user' && e.detail.includes('ambulance'))).toBe(true);
  });
});
