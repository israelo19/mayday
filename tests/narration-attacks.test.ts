// The model-to-ear gate, attacked. src/protocol/validate.ts is the only thing between a
// language model and a bystander's ear (CLAUDE.md principle 1), so it is tested the way a
// guard should be: with paraphrases that keep every number and every required word and still
// invert, delay, relocate or truncate the instruction. Eleven of these fourteen passed before
// the polarity, comparator, unit, place, urgency and minimum-length checks were added.
//
// A faithful paraphrase must still get through, or the feature is off in all but name; the
// second block holds that line.
import { describe, expect, it } from 'vitest';
import { machines, validateNarration } from '../src/protocol';
import type { State } from '../src/types';

const state = (requiredWords?: string[]): State =>
  ({ id: 's', source: 'test', say: [], transitions: [], requiredWords }) as unknown as State;

const PUSH = 'Push hard and fast, at least two inches deep.';
const CALL = 'Call 911 right now. Put the phone on speaker and lay it on the ground beside him.';
const HANDS = 'Put the heel of one hand on the center of his chest, between the nipples.';

describe('a paraphrase that changes the instruction never reaches the ear', () => {
  const attacks: [string, string, string[] | undefined, string][] = [
    ['inverts it', 'Do not push hard and fast, at least two inches deep.', ['push'], PUSH],
    ['drops a negation', 'Remove the soaked cloth. Add more cloth on top and keep pressing.', ['cloth'],
     'Do not remove the soaked cloth. Add more cloth on top and keep pressing.'],
    ['flips a critical', 'Stop. Keep pushing. Help is coming.', ['push'], "Don't stop. Keep pushing. Help is coming."],
    ['changes the units', 'Push hard and fast, at least two centimetres deep.', ['push'], PUSH],
    ['weakens the bound', 'Push hard and fast, at most two inches deep.', ['push'], PUSH],
    ['hedges the imperative', 'You could push hard and fast, about two inches deep, if you feel able.', ['push'], PUSH],
    ['adds a breath', 'Push hard and fast, at least two inches deep. Tilt his head back and give him a breath first.', ['push'], PUSH],
    ['delays the call', 'Call 911 in a little while. Put the phone on speaker and lay it on the ground beside him.', ['911'], CALL],
    ['drops a whole clause', 'Call 911 right now.', ['911'], CALL],
    ['moves the compression site', 'Put the heel of one hand on the side of his chest, below the ribs.', ['hand', 'chest'], HANDS],
    ['changes the body part', 'Kneel beside his head.', ['hand', 'chest'], 'Kneel beside his chest.'],
    ['softens the pressure', 'Take cloth if you have it. Press it gently onto the wound with one hand.', ['press', 'wound'],
     'Take cloth if you have it. Press it hard onto the wound with both hands.'],
    ['inflates a number word', 'Push hard and fast, at least twenty inches deep.', ['push'], PUSH],
  ];

  for (const [why, paraphrase, required, canonical] of attacks) {
    it(`refuses one that ${why}`, () => {
      const result = validateNarration(paraphrase, canonical, state(required), []);
      expect(result.ok, `"${paraphrase}" was allowed through`).toBe(false);
      expect(result.text).toBe(canonical); // the canonical line is what speaks
    });
  }
});

describe('a faithful paraphrase still gets through', () => {
  const faithful: [string, string, string[] | undefined, string][] = [
    ['reorders the clauses', 'Push hard, push fast, at least 2 inches deep.', ['push'], PUSH],
    ['warms the tone', 'I know this is hard. Push hard and fast, at least two inches deep.', ['push'], PUSH],
    ['keeps both negations', "Don't stop pushing. Help is on the way, keep going.", ['push'],
     "Don't stop. Keep pushing. Help is coming."],
    ['acknowledges what was measured', 'I can see you at 80. Faster, push with the beat.', ['push'],
     'Faster. Push with the beat.'],
  ];

  for (const [why, paraphrase, required, canonical] of faithful) {
    it(`allows one that ${why}`, () => {
      const result = validateNarration(paraphrase, canonical, state(required), [80]);
      expect(result.ok, `rejected: ${result.reason}`).toBe(true);
      expect(result.text).toBe(paraphrase);
    });
  }

  it('holds every canonical line in every machine valid against itself', () => {
    for (const machine of machines) {
      for (const s of machine.states) {
        for (const line of s.say) {
          expect(validateNarration(line, line, s).ok, `${machine.id}.${s.id}`).toBe(true);
        }
      }
      // The answers are machine-wide, and every one of them is a line the app may speak.
      for (const answer of machine.keywordResponses ?? []) {
        const anywhere = machine.states[0];
        expect(validateNarration(answer.say, answer.say, anywhere).ok, `${machine.id} answer '${answer.keyword}'`).toBe(true);
      }
    }
  });
});
