import { describe, expect, it } from 'vitest';
import { machines, validateNarration } from '../src/protocol';

const compressions = machines
  .find((m) => m.id === 'cardiac')!
  .states.find((s) => s.id === 'compressions')!;
const canonical = compressions.say[0]; // "Push hard and fast, at least two inches deep."

describe('narration validator', () => {
  it('lets a faithful paraphrase through', () => {
    const result = validateNarration('Push hard, push fast, at least 2 inches down.', canonical, compressions);
    expect(result.ok).toBe(true);
    expect(result.text).toContain('Push hard');
  });

  it('falls back to the canonical line when a number is dropped', () => {
    const result = validateNarration('Push hard and fast, nice and deep.', canonical, compressions);
    expect(result.ok).toBe(false);
    expect(result.text).toBe(canonical);
    expect(result.reason).toContain('number');
  });

  it("falls back when the state's required word is gone", () => {
    const result = validateNarration('Compress the chest two inches.', canonical, compressions);
    expect(result.ok).toBe(false);
    expect(result.text).toBe(canonical);
  });

  it('refuses a paraphrase that invents guidance we do not give', () => {
    const result = validateNarration(
      'Push hard and fast, at least two inches deep, then give two rescue breaths.',
      canonical,
      compressions,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('rescue breath');
  });

  it('refuses an empty or rambling paraphrase', () => {
    expect(validateNarration('   ', canonical, compressions).ok).toBe(false);
    expect(validateNarration(`${canonical} ${canonical} ${canonical}`, canonical, compressions).ok).toBe(false);
  });

  it('accepts a term we do coach when the canonical line already has it', () => {
    const tourniquet = machines.find((m) => m.id === 'bleeding')!.keywordResponses![0];
    const state = machines.find((m) => m.id === 'bleeding')!.states.find((s) => s.id === 'pressure')!;
    const result = validateNarration(
      'If you have a real tourniquet kit, put it 2 to 3 inches above the wound, off the joint, and tighten until bleeding stops. Otherwise keep pressing.',
      tourniquet.say,
      state,
    );
    expect(result.ok).toBe(true);
  });

  it('holds the canonical line of every state as valid against itself', () => {
    for (const machine of machines) {
      for (const state of machine.states) {
        for (const line of state.say) {
          expect(validateNarration(line, line, state).ok, `${machine.id}.${state.id}`).toBe(true);
        }
      }
    }
  });
});

describe('numbers a rewording may use', () => {
  const nag = 'Faster. Push with the beat.';

  it('allows a measurement the caller put in front of the model, and nothing else', () => {
    expect(validateNarration('You are at 80. Faster. Push with the beat.', nag, compressions, [80]).ok).toBe(true);
    const invented = validateNarration('You are at 80. Faster. Push with the beat.', nag, compressions, []);
    expect(invented.ok).toBe(false);
    expect(invented.text).toBe(nag);
    expect(invented.reason).toContain('introduced the number 80');
    // Without the list the old contract stands: only the line's own numbers are checked.
    expect(validateNarration('You are at 80. Faster. Push with the beat.', nag, compressions).ok).toBe(true);
  });
});
