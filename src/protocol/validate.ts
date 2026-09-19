// The gate between a language model and a human ear (principle 1). A paraphrase is speakable
// only if it preserves the numbers, keeps the state's required words, stays roughly as short
// as the canonical line, and adds nothing we do not coach. Any miss speaks the canonical line.
import type { State } from '../types';

/** Guidance a model might helpfully add that our protocols deliberately do not contain. */
const NEVER_COACH = [
  'rescue breath',
  'mouth to mouth',
  'mouth-to-mouth',
  'breathe into',
  'aspirin',
  'medication',
  'medicine',
  'nitroglycerin',
  'epipen',
  'defibrillator',
  'aed',
  'pulse',
  'tourniquet',
];

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
};

export type Validation = { ok: boolean; text: string; reason?: string };

/**
 * Validates a paraphrase of one canonical line. `text` is what the app should speak: the
 * paraphrase when it passes, the canonical line whenever anything is off.
 */
export function validateNarration(paraphrase: string, canonical: string, state: State): Validation {
  const fail = (reason: string): Validation => ({ ok: false, text: canonical, reason });
  const candidate = paraphrase.trim();
  if (!candidate) return fail('empty');
  if (candidate.length > canonical.length * 2 + 40) return fail('too long to be a paraphrase');

  const lower = candidate.toLowerCase();
  const canon = canonical.toLowerCase();

  for (const value of numbersIn(canon)) {
    if (!numbersIn(lower).has(value)) return fail(`dropped the number ${value}`);
  }
  for (const word of state.requiredWords ?? []) {
    const required = word.toLowerCase();
    if (canon.includes(required) && !containsStem(lower, required)) {
      return fail(`dropped the required word '${word}'`);
    }
  }
  for (const term of NEVER_COACH) {
    if (lower.includes(term) && !canon.includes(term)) return fail(`introduced '${term}'`);
  }
  return { ok: true, text: candidate };
}

/** Numbers as values, so "two inches" and "2 inches" are the same claim. */
function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const digits of text.match(/\d+/g) ?? []) found.add(String(Number(digits)));
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) found.add(value);
  }
  return found;
}

/** Prefix match on a word boundary, so 'push' is kept by 'pushing'. */
function containsStem(text: string, stem: string): boolean {
  return new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text);
}
