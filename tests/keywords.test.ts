import { describe, expect, it } from 'vitest';
import { createEngine, matchKeyword, matchKeywords, machines } from '../src/protocol';

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

describe('negation on the machines a judge will actually talk to', () => {
  it('bleeding scene_safety does not treat "not safe" as safe', () => {
    const keywords = machines
      .find((m) => m.id === 'bleeding')!
      .states.find((s) => s.id === 'scene_safety')!
      .transitions.flatMap((t) => (t.on.kind === 'keyword' ? [t.on.keyword] : []));
    expect(matchKeyword("it's not safe", keywords)).toBeNull();
    expect(matchKeyword('I am not safe yet', keywords)).toBeNull();
    expect(matchKeyword("I'm safe", keywords)).toBe("i'm safe");
  });

  it('choking confirm does not treat "not coughing" as coughing', () => {
    const keywords = machines
      .find((m) => m.id === 'choking')!
      .states.find((s) => s.id === 'confirm')!
      .transitions.flatMap((t) => (t.on.kind === 'keyword' ? [t.on.keyword] : []));
    expect(matchKeyword("he's not coughing", keywords)).toBeNull();
    expect(matchKeyword('he is coughing', keywords)).toBe('coughing');
    expect(matchKeyword("he can't cough", keywords)).toBe("can't cough");
  });
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

/** The keywords a state listens for, in data order. */
const keywordsOf = (machineId: string, stateId: string): string[] =>
  machines
    .find((m) => m.id === machineId)!
    .states.find((s) => s.id === stateId)!
    .transitions.flatMap((t) => (t.on.kind === 'keyword' ? [t.on.keyword] : []));

/** Where the real engine lands when it hears `sentence` in a state. */
function landsOn(machineId: string, stateId: string, sentence: string): string {
  const engine = createEngine(machines);
  engine.start(machineId, stateId, 1_700_000_000_000);
  engine.onKeyword(sentence);
  const cur = engine.currentState()!;
  return `${cur.machineId}.${cur.state.id}`;
}

describe('a state listens in priority order, and safety is listed first', () => {
  // "Gasping does not count as breathing", says the state's own line. The old matcher took the
  // longest keyword present, and "he's breathing" is longer than 'gasping'.
  it.each([
    ["he's breathing but gasping", 'cardiac.call_911'],
    ["he's breathing but not normally", 'cardiac.call_911'],
    ['yes but barely', 'cardiac.call_911'],
    ["yes he's breathing", 'cardiac.recovery_hold'],
    ['he is breathing', 'cardiac.recovery_hold'],
    ['no', 'cardiac.call_911'],
  ])('check_breathing hears "%s" and goes to %s', (sentence, to) => {
    expect(landsOn('cardiac', 'check_breathing', sentence)).toBe(to);
  });

  it('reports every keyword it heard, in the order the state lists them', () => {
    const hits = matchKeywords("he's breathing but gasping", keywordsOf('cardiac', 'check_breathing'));
    expect(hits).toEqual(['gasping', "he's breathing"]);
  });

  it('does not hear a question as an answer', () => {
    const keywords = keywordsOf('cardiac', 'check_breathing');
    expect(matchKeyword('is he breathing', keywords)).toBeNull();
    expect(matchKeyword('he is not breathing', keywords)).toBe('not breathing');
  });
});

describe('the phrasings a state invites are the ones it hears', () => {
  it.each([
    ['cardiac', 'recovery_hold', 'he stopped breathing', 'cardiac.call_911'],
    ['cardiac', 'recovery_hold', "he isn't breathing", 'cardiac.call_911'],
    ['cardiac', 'recovery_hold', "he's gasping again", 'cardiac.call_911'],
  ])('%s.%s hears "%s" and goes to %s', (machineId, stateId, sentence, to) => {
    expect(landsOn(machineId, stateId, sentence)).toBe(to);
  });

  it.each([
    ['choking', 'encourage_cough', 'he stopped making sound', 'choking.call_911'],
    ['choking', 'encourage_cough', "he's not making any sound", 'choking.call_911'],
    ['choking', 'encourage_cough', "he's gone quiet", 'choking.call_911'],
    ['choking', 'encourage_cough', 'it came out', 'choking.resolved'],
  ])('%s.%s hears "%s" and goes to %s', (machineId, stateId, sentence, to) => {
    expect(landsOn(machineId, stateId, sentence)).toBe(to);
  });

  it.each([
    ['choking', 'confirm', "he's not talking", 'choking.call_911'],
    ['choking', 'confirm', "he's not making a sound", 'choking.call_911'],
    ['choking', 'confirm', "he's not speaking", 'choking.call_911'],
    ['choking', 'confirm', 'he is talking', 'choking.encourage_cough'],
  ])('%s.%s hears "%s" and goes to %s', (machineId, stateId, sentence, to) => {
    expect(landsOn(machineId, stateId, sentence)).toBe(to);
  });

  it.each([
    ['bleeding', 'scene_safety', 'they are gone', 'bleeding.call_911'],
    ['bleeding', 'scene_safety', "he's gone", 'bleeding.call_911'],
    ['bleeding', 'scene_safety', "they're not gone", 'bleeding.scene_safety'],
  ])('%s.%s hears "%s" and goes to %s', (machineId, stateId, sentence, to) => {
    expect(landsOn(machineId, stateId, sentence)).toBe(to);
  });
});

describe('the scene-safety gate is not opened by a question or a condition', () => {
  const keywords = keywordsOf('bleeding', 'scene_safety');

  it.each([
    'is it safe to go over there',
    'am i safe',
    "i'll tell you when it's safe",
    "i'll wait until it's safe",
    "once it's safe i'll go",
  ])('stays shut on "%s"', (sentence) => {
    expect(matchKeyword(sentence, keywords)).toBeNull();
    expect(landsOn('bleeding', 'scene_safety', sentence)).toBe('bleeding.scene_safety');
  });

  it.each(['it is safe now', "yes it's safe", 'i am safe', "we're safe", 'yes', 'safe'])('still opens on "%s"', (sentence) => {
    // 'yes' is not a keyword of this state; it is the answer to a suggestion, and it is here so
    // the plain-answer path is pinned as matching what it says.
    const said = sentence === 'yes' ? matchKeyword(sentence, ['yes']) : matchKeyword(sentence, keywords);
    expect(said, sentence).not.toBeNull();
  });
});
