import { describe, expect, it } from 'vitest';
import { looksLikeCoaching, machines, validateNarration } from '../src/protocol';
import { DISPATCHER_ACK, DISPATCHER_SCRIPT } from '../src/voice/dispatcher';

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
      'If you have a real tourniquet kit, place it 2 to 3 inches above the wound, not on a joint, and tighten until the bleeding stops. Keep pressing otherwise.',
      tourniquet.say,
      state,
    );
    expect(result.ok, result.reason).toBe(true);
  });

  it("does not let 'top' hide inside 'stop' or 'side' inside 'beside'", () => {
    const top = 'Put your other hand on top. Lace your fingers.';
    const moved = validateNarration('Put your other hand on it. Lace your fingers, then stop.', top, compressions);
    expect(moved.ok).toBe(false);
    expect(moved.reason).toBe('changed where on the body');
    const kneel = 'Kneel beside his chest.';
    const side = validateNarration('Kneel at the side of his chest.', kneel, compressions);
    expect(side.ok).toBe(false);
    expect(side.reason).toBe('changed where on the body');
  });

  it('holds a paraphrase to one extra sentence and half again the length', () => {
    const nag = 'Faster. Push with the beat.';
    const long = validateNarration('Faster. Push with the beat. Keep going. You can do this.', nag, compressions);
    expect(long.ok).toBe(false);
    expect(long.reason).toBe('added a sentence');
    const padded = validateNarration(`${'Push hard and fast, at least two inches deep.'} I know this is hard, I know, I know, I know it is hard.`, canonical, compressions);
    expect(padded.ok).toBe(false);
    expect(padded.reason).toBe('too long to be a paraphrase');
  });

  it('lets a warm opener through when every other word is the line\'s own', () => {
    // The shapes web/session.test.ts drives its fake rewording with: an opener on a step line,
    // and an acknowledgment plus the measured number on a nag.
    const step = "Make sure it's safe to approach.";
    const opener = validateNarration(`Okay, ${step}`, step, compressions);
    expect(opener.ok, opener.reason).toBe(true);
    const nag = 'Faster. Push with the beat.';
    const warm = validateNarration('I know this is hard, you are at 80. Faster. Push with the beat.', nag, compressions, [80]);
    expect(warm.ok, warm.reason).toBe(true);
    // A word the line does not have is an instruction the line does not give, even when it
    // is only colour: the canonical line speaks instead.
    expect(validateNarration(`Warmly: ${step}`, step, compressions).reason).toBe("introduced 'warmly'");
    // Too long for a nag this short, and 'arms' is not the line's word: refused either way.
    expect(validateNarration('Your arms are burning, I know. You are at 80. Faster. Push with the beat.', nag, compressions, [80]).ok).toBe(false);
  });

  it('lets a rewording mention what the caller measured, and nothing else it did not say', () => {
    const nag = 'Faster. Push with the beat.';
    const line = 'I can see you at about 80. Faster. Push with the beat.';
    const blind = validateNarration(line, nag, compressions, [80]);
    expect(blind.ok).toBe(false);
    expect(blind.reason).toBe("introduced 'about'");
    const told = validateNarration(line, nag, compressions, [80], { observations: 'pushing at about 80 a minute' });
    expect(told.ok, told.reason).toBe(true);
    expect(told.text).toBe(line);
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

describe('looksLikeCoaching, the screen on the simulated dispatcher', () => {
  it('lets every scripted dispatcher line and the questions the agent is told to ask through', () => {
    const legit = [
      ...DISPATCHER_SCRIPT,
      DISPATCHER_ACK,
      'Is he awake? Is he breathing?',
      'Is the bleeding heavy? Where is the wound?',
      'Is his chest moving at all?',
      'Has the bleeding stopped?',
      'Okay. What happened? Tell me what you see.',
      'Help is on the way. Stay on the line and keep following the coaching.',
      'Help is heading to you now. You are doing great.',
      "I understand. Don't hang up.",
      'Got it, 41 Main Street. Help is coming.',
      'This is a simulation.',
    ];
    for (const line of legit) expect(looksLikeCoaching(line), line).toBe(false);
  });

  it('refuses a reply that tells the bystander what to do to the patient', () => {
    const coaching = [
      'Stop the compressions and sit him up.',
      'Okay, stop pushing, he is fine now.',
      'Tilt his head back to open the airway.',
      'Give him a breath between compressions.',
      'Give him some water.',
      'Push harder on his chest.',
      'Take a break, you have earned it.',
      'You can pause now, help is close.',
      'Roll him onto his stomach.',
      'Pull it out and press on the wound.',
      'Could you stop the compressions for a moment?',
    ];
    for (const line of coaching) expect(looksLikeCoaching(line), line).toBe(true);
  });
});
