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
  // Last, so the more specific entries above own the failure reason. Catches the wordings
  // that dodge them: "give him a breath", "a couple of breaths", "breath first".
  'breath',
];

/**
 * Words that negate the word after them. Apostrophes are stripped first, so "don't" arrives
 * as "dont". A paraphrase may not negate something the canonical asserts, and may not assert
 * something the canonical negates: "Do not push hard and fast" and "Remove the soaked cloth"
 * both kept every number and every required word, and both invert the instruction.
 */
const NEGATORS = new Set(['not', 'no', 'never', 'dont', 'cant', 'cannot', 'wont', 'doesnt', 'didnt', 'isnt', 'without']);

/** Carried along by a negation without being what is negated. */
const FUNCTION_WORDS = new Set(['do', 'to', 'the', 'a', 'an', 'your', 'his', 'her', 'their', 'its', 'it', 'him', 'them', 'is', 'are', 'be', 'you', 'and', 'or', 'of', 'that', 'this', 'any', 'more']);

/** Quantity comparators: swapping one for another rewrites the dose while keeping the digit. */
const COMPARATORS = ['at least', 'at most', 'no more than', 'no less than'];

/** Units: "two inches" and "two centimetres" share a number and mean different depths. */
const UNITS = ['inch', 'centimet', 'millimet', 'minute', 'hour', 'finger'];

/** How soon: "Call 911 right now" became "Call 911 in a little while" with nothing else changed. */
const URGENCY = ['right now', 'right away', 'immediately', 'straight away'];

/** Where on the body: swapping one rewrites the compression site while keeping every word we check. */
const PLACES = ['above', 'below', 'beside', 'between', 'center', 'centre', 'middle', 'side', 'top', 'underneath', 'behind'];

/** Lowercased words, apostrophes dropped, punctuation to spaces. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** The first content word after each negator: what the sentence says NOT to do. */
function negatedWords(text: string): Set<string> {
  const words = wordsOf(text);
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    if (!NEGATORS.has(words[i])) continue;
    for (let j = i + 1; j < words.length; j++) {
      if (NEGATORS.has(words[j])) break;
      if (FUNCTION_WORDS.has(words[j])) continue;
      out.add(words[j]);
      break;
    }
  }
  return out;
}

/** Which of `terms` the text contains, as a stable sorted key. */
function present(text: string, terms: readonly string[]): string {
  return terms.filter((t) => text.includes(t)).join(',');
}

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
 * paraphrase when it passes, the canonical line whenever anything is off. With
 * `allowedNumbers` (the measurements the caller put in front of the model), any number in
 * the paraphrase that is neither the line's own nor one of those is an invention and fails.
 */
export function validateNarration(paraphrase: string, canonical: string, state: State, allowedNumbers?: readonly number[]): Validation {
  const fail = (reason: string): Validation => ({ ok: false, text: canonical, reason });
  const candidate = paraphrase.trim();
  if (!candidate) return fail('empty');
  if (candidate.length > canonical.length * 2 + 40) return fail('too long to be a paraphrase');
  // A paraphrase much shorter than the line it paraphrases has dropped a clause, and a dropped
  // clause is a dropped instruction: "Call 911 right now. Put the phone on speaker and lay it
  // on the ground beside him." came back as "Call 911 right now." with nothing else missing
  // that the other checks look at.
  if (candidate.length < canonical.length * 0.6) return fail('too short to carry the whole line');

  const lower = candidate.toLowerCase();
  const canon = canonical.toLowerCase();

  for (const value of numbersIn(canon)) {
    if (!numbersIn(lower).has(value)) return fail(`dropped the number ${value}`);
  }
  if (allowedNumbers) {
    const allowed = new Set([...numbersIn(canon), ...allowedNumbers.map((n) => String(n))]);
    for (const value of numbersIn(lower)) {
      if (!allowed.has(value)) return fail(`introduced the number ${value}`);
    }
  }
  // Polarity. Anything the canonical negates must stay negated or be gone; anything the
  // paraphrase negates must already be negated in the canonical or be absent from it.
  const canonNegated = negatedWords(canon);
  const paraNegated = negatedWords(lower);
  const paraWords = new Set(wordsOf(lower));
  const canonWords = new Set(wordsOf(canon));
  for (const word of canonNegated) {
    if (paraWords.has(word) && !paraNegated.has(word)) return fail(`stopped negating '${word}'`);
  }
  for (const word of paraNegated) {
    if (canonWords.has(word) && !canonNegated.has(word)) return fail(`negated '${word}', which the line does not`);
  }

  // A comparator, a unit or a place swapped under an unchanged number rewrites the instruction
  // while every other check still passes: "at most two inches", "two centimetres deep", and
  // "the side of his chest, below the ribs" all did.
  if (present(canon, COMPARATORS) !== present(lower, COMPARATORS)) return fail('changed how much');
  if (present(canon, UNITS) !== present(lower, UNITS)) return fail('changed the units');
  if (present(canon, PLACES) !== present(lower, PLACES)) return fail('changed where on the body');
  if (present(canon, URGENCY) !== present(lower, URGENCY)) return fail('changed how soon');

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
