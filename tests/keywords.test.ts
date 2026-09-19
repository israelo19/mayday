import { describe, expect, it } from 'vitest';
import { matchKeyword, machines } from '../src/protocol';

describe('phrase matching', () => {
  it("does not let 'no' swallow 'no response'", () => {
    expect(matchKeyword('he has no response', ['no', 'no response'])).toBe('no response');
  });

  it("does not fire 'no' inside 'not breathing'", () => {
    expect(matchKeyword('he is not breathing', ['no'])).toBeNull();
  });

  it('prefers the longer phrase when both are present', () => {
    expect(matchKeyword("he's not breathing at all", ['no', 'not breathing'])).toBe('not breathing');
  });

  it('survives a recognizer that drops apostrophes', () => {
    expect(matchKeyword('hes not breathing', ["he's breathing", 'not breathing'])).toBe('not breathing');
    expect(matchKeyword('hes breathing now', ["he's breathing"])).toBe("he's breathing");
  });

  it('ignores punctuation and casing', () => {
    expect(matchKeyword('AMBULANCE HERE!', ['ambulance here'])).toBe('ambulance here');
  });

  it('matches whole words only', () => {
    expect(matchKeyword('the shotgun is gone', ['shot'])).toBeNull();
    expect(matchKeyword('he was shot', ['shot'])).toBe('shot');
  });

  it('returns null on anything it was not given', () => {
    expect(matchKeyword('I am scared and I do not know what to do', ['not breathing'])).toBeNull();
  });
});

describe('every state resolves its own keywords', () => {
  // A keyword that matches a different keyword in the same state routes the bystander to the
  // wrong protocol. This is the check that would have caught 'no' versus 'no response'.
  for (const machine of machines) {
    for (const state of machine.states) {
      const keywords = state.transitions.flatMap((t) => (t.on.kind === 'keyword' ? [t.on.keyword] : []));
      if (keywords.length === 0) continue;
      it(`${machine.id}.${state.id}`, () => {
        for (const keyword of keywords) expect(matchKeyword(keyword, keywords)).toBe(keyword);
      });
    }
  }
});

describe('the dangerous collisions in the cardiac branch', () => {
  const keywords = machines
    .find((m) => m.id === 'cardiac')!
    .states.find((s) => s.id === 'check_breathing')!
    .transitions.flatMap((t) => (t.on.kind === 'keyword' ? [t.on.keyword] : []));

  it('hears a negative in a panicked sentence', () => {
    expect(matchKeyword("oh god he's not breathing", keywords)).toBe('not breathing');
  });

  it('hears a positive without mistaking it for a negative', () => {
    expect(matchKeyword("yes he's breathing", keywords)).toBe("he's breathing");
  });
});
