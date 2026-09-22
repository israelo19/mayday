// The gate between a language model and a human ear (principle 1). A paraphrase is speakable
// only if it preserves the numbers, keeps the state's required words, keeps every negation,
// keeps how hard and which way, stays roughly as short as the canonical line, and uses no
// content word the line itself does not: a rewording, never a rewrite. Any miss speaks the
// canonical line.
import type { State } from '../types';
import { stem } from './language';

/**
 * Guidance a model might helpfully add that our protocols deliberately do not contain, and
 * the places on the body and the moves we never introduce. A paraphrase may keep the ones its
 * own line has; it may not add "tilt his head back", "on his stomach" or "check his airway".
 * Specific entries first, so they own the failure reason.
 */
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
  'find help',
  'go get',
  'sit him up',
  'move him',
  'pull it out',
  'heartbeat',
  'airway',
  'stomach',
  'belly',
  'abdomen',
  'throat',
  'mouth',
  'chest',
  'head',
  'neck',
  'tilt',
  'roll',
  'remove',
  'leave',
  'rest',
  'break',
  'pause',
  'wait',
  'water',
  'drink',
  // Last, so the more specific entries above own the failure reason. Catches the wordings
  // that dodge them: "give him a breath", "a couple of breaths", "breath first".
  'breath',
];

/**
 * Words that negate the word after them. Apostrophes are stripped first, so "don't" arrives
 * as "dont". A paraphrase may not negate something the canonical asserts, and may not assert
 * something the canonical negates: "Do not push hard and fast" and "Remove the soaked cloth"
 * both kept every number and every required word, and both invert the instruction. "Stop"
 * and "avoid" negate too: "Stop pressing" is "Do not press" with the same words.
 */
const NEGATORS = new Set([
  'not', 'no', 'never', 'dont', 'cant', 'cannot', 'wont', 'doesnt', 'didnt', 'isnt', 'without',
  'hasnt', 'havent', 'hadnt', 'wasnt', 'werent', 'shouldnt', 'wouldnt', 'avoid', 'stop',
]);

/** Carried along by a negation without being what is negated. */
const FUNCTION_WORDS = new Set(['do', 'to', 'the', 'a', 'an', 'your', 'his', 'her', 'their', 'its', 'it', 'him', 'them', 'is', 'are', 'be', 'you', 'and', 'or', 'of', 'that', 'this', 'any', 'more']);

/**
 * Words a warm rewording adds around the line without adding to it: "I know this is hard",
 * "I can see you at 80", "okay, now", "help is on the way". Everything else a paraphrase says
 * must already be in the line (or in what the caller measured), because a word the line does
 * not have is an instruction the line does not give.
 */
const ACKNOWLEDGE = new Set([
  'i', 'know', 'hear', 'see', 'can', 'you', 'this', 'is', 'hard', 'good', 'keep', 'going', 'okay', 'now', 'with', 'me',
  'just', 'still', 'right', 'lets', 'let', 'us', 'well', 'here', 'there', 'please', 'ok', 'alright',
  'at', 'on', 'down', 'way',
]);

/** Quantity comparators: swapping one for another rewrites the dose while keeping the digit. */
const COMPARATORS = ['at least', 'at most', 'no more than', 'no less than'];

/** Units: "two inches" and "two centimetres" share a number and mean different depths. */
const UNITS = ['inch', 'centimet', 'millimet', 'minute', 'hour', 'finger'];

/** How soon: "Call 911 right now" became "Call 911 in a little while" with nothing else changed. */
const URGENCY = ['right now', 'right away', 'immediately', 'straight away'];

/** Where on the body: swapping one rewrites the compression site while keeping every word we check. */
const PLACES = ['above', 'below', 'beside', 'between', 'center', 'centre', 'middle', 'side', 'top', 'underneath', 'behind'];

/**
 * How hard and how far: "Push gently and slowly, at least two inches deep" and "Press it
 * lightly onto the wound" kept every number and every required word. Prefixes, so 'gentl'
 * is gentle and gently, 'slow' is slower and slowly, 'lock' is locked.
 */
const MANNER = ['hard', 'fast', 'firm', 'gentl', 'soft', 'light', 'slow', 'full', 'ease', 'all the way', 'part of the way', 'lock'];

/** Which way: "Pull hard, downward and outward" is the abdominal thrust done backwards. */
const DIRECTIONS = ['inward', 'upward', 'downward', 'outward', 'forward', 'backward'];

/** Lowercased words, apostrophes dropped, punctuation to spaces. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The first content word after each negator: what the sentence says NOT to do. A negated
 * negator ("don't stop") is the thing negated, not a negation of what follows it, so
 * "Don't stop. Keep pushing." negates 'stop' and leaves 'keep' alone.
 */
function negatedWords(text: string): Set<string> {
  const words = wordsOf(text);
  const out = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    if (!NEGATORS.has(words[i])) continue;
    for (let j = i + 1; j < words.length; j++) {
      if (FUNCTION_WORDS.has(words[j])) continue;
      out.add(words[j]);
      if (NEGATORS.has(words[j])) i = j;
      break;
    }
  }
  return out;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `term` starts a word of `text`: 'top' in "on top" and "topmost", never in "stop". */
function hasTerm(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}`).test(text);
}

/** Which of `terms` the text contains, as a stable sorted key. */
function present(text: string, terms: readonly string[]): string {
  return terms.filter((t) => hasTerm(text, t)).join(',');
}

/**
 * True when the paraphrase drops a manner word the line has, or adds one the line lacks.
 * 'hard' may be added: it is the one manner word that is also an acknowledgment ("I know
 * this is hard"), and adding it never softens an instruction. Every other manner word a
 * line lacks is refused here or by the introduced-word check.
 */
function mannerChanged(canon: string, lower: string): boolean {
  const before = MANNER.filter((t) => hasTerm(canon, t));
  const after = MANNER.filter((t) => hasTerm(lower, t));
  if (before.some((t) => !after.includes(t))) return true;
  return after.some((t) => t !== 'hard' && !before.includes(t));
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
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  hundred: '100',
  half: '0.5',
  quarter: '0.25',
  // A multiplier, not the number two: "twice as deep" must not pass because the line says two.
  twice: 'x2',
  double: 'x2',
};

export type Validation = { ok: boolean; text: string; reason?: string };

/** What the caller may tell the validator besides the line: the measurements it put in front of the model. */
export type ValidationContext = {
  /** Plain phrases such as "pushing at about 85 a minute"; their words may appear in the paraphrase. */
  observations?: string;
};

/**
 * Validates a paraphrase of one canonical line. `text` is what the app should speak: the
 * paraphrase when it passes, the canonical line whenever anything is off. With
 * `allowedNumbers` (the measurements the caller put in front of the model), any number in
 * the paraphrase that is neither the line's own nor one of those is an invention and fails.
 * With `context.observations`, the words of those measurements may appear too; every other
 * content word must come from the line.
 */
export function validateNarration(
  paraphrase: string,
  canonical: string,
  state: State,
  allowedNumbers?: readonly number[],
  context?: ValidationContext,
): Validation {
  const fail = (reason: string): Validation => ({ ok: false, text: canonical, reason });
  const candidate = paraphrase.trim();
  if (!candidate) return fail('empty');
  if (candidate.length > canonical.length * 1.5 + 25) return fail('too long to be a paraphrase');
  // A paraphrase much shorter than the line it paraphrases has dropped a clause, and a dropped
  // clause is a dropped instruction: "Call 911 right now. Put the phone on speaker and lay it
  // on the ground beside him." came back as "Call 911 right now." with nothing else missing
  // that the other checks look at.
  if (candidate.length < canonical.length * 0.6) return fail('too short to carry the whole line');

  const lower = candidate.toLowerCase();
  const canon = canonical.toLowerCase();

  // One extra sentence is a warm opener. Two is a second instruction.
  if (sentencesIn(lower) > sentencesIn(canon) + 1) return fail('added a sentence');

  for (const value of numbersIn(canon)) {
    if (!numbersIn(lower).has(value)) return fail(`dropped the number ${value}`);
  }
  if (allowedNumbers) {
    const allowed = new Set([...numbersIn(canon), ...allowedNumbers.map((n) => String(n))]);
    for (const value of numbersIn(lower)) {
      if (!allowed.has(value)) return fail(`introduced the number ${value}`);
    }
  }
  // Polarity. Anything the canonical negates must still be there and still negated; anything
  // the paraphrase negates must already be negated in the canonical or be absent from it.
  // "Feel free to peek, but don't stop" kept one of the two negations of "Do not lift your
  // hands to look. Do not stop." and inverted the other by leaving it out.
  const canonNegated = negatedWords(canon);
  const paraNegated = negatedWords(lower);
  const paraWords = new Set(wordsOf(lower));
  const canonWords = new Set(wordsOf(canon));
  for (const word of canonNegated) {
    if (paraNegated.has(word)) continue;
    return fail(paraWords.has(word) ? `stopped negating '${word}'` : `dropped the negated '${word}'`);
  }
  for (const word of paraNegated) {
    if (canonWords.has(word) && !canonNegated.has(word)) return fail(`negated '${word}', which the line does not`);
  }

  // A comparator, a unit, a place, a manner or a direction swapped under an unchanged number
  // rewrites the instruction while every other check still passes: "at most two inches",
  // "two centimetres deep", "the side of his chest, below the ribs", "push gently" and "pull
  // downward and outward" all did.
  if (present(canon, COMPARATORS) !== present(lower, COMPARATORS)) return fail('changed how much');
  if (present(canon, UNITS) !== present(lower, UNITS)) return fail('changed the units');
  if (present(canon, PLACES) !== present(lower, PLACES)) return fail('changed where on the body');
  if (present(canon, URGENCY) !== present(lower, URGENCY)) return fail('changed how soon');
  if (mannerChanged(canon, lower)) return fail('changed how hard or how far');
  if (present(canon, DIRECTIONS) !== present(lower, DIRECTIONS)) return fail('changed which way');

  for (const word of state.requiredWords ?? []) {
    const required = word.toLowerCase();
    if (canon.includes(required) && !containsStem(lower, required)) {
      return fail(`dropped the required word '${word}'`);
    }
  }
  for (const term of NEVER_COACH) {
    if (hasTerm(lower, term) && !hasTerm(canon, term)) return fail(`introduced '${term}'`);
  }
  // Every content word must come from the line or from what was measured. This is the check
  // that makes the others unnecessary for most of what a model could add: "then go find
  // help", "take a break whenever you need" and "on his stomach" are all words the line
  // never said.
  const introduced = introducedWord(lower, canon, context?.observations ?? '');
  if (introduced !== null) return fail(`introduced '${introduced}'`);
  return { ok: true, text: candidate };
}

/** The first content word of the paraphrase that neither the line nor the observations contain, or null. */
function introducedWord(lower: string, canon: string, observations: string): string | null {
  const known = [...wordsOf(canon), ...wordsOf(observations)];
  for (const word of wordsOf(lower)) {
    if (/^\d+$/.test(word)) continue; // numbers have their own check
    if (FUNCTION_WORDS.has(word) || NEGATORS.has(word) || ACKNOWLEDGE.has(word)) continue;
    if (!known.some((k) => sameStem(word, k))) return word;
  }
  return null;
}

/** "push" and "pushing", "press" and "pressure", "slow" and "slower": one word, inflected. */
function sameStem(a: string, b: string): boolean {
  if (a === b || stem(a) === stem(b)) return true;
  return Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/** Sentences, as a listener hears them: one per full stop, question mark or exclamation. */
function sentencesIn(text: string): number {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

/**
 * The screen for the simulated dispatcher's free-form replies (principle 1). The agent has no
 * canonical line to be checked against, so the test is simpler: does the reply tell the
 * bystander to do something to the patient? The agent's job is to ask, reassure and say help
 * is coming; the moment it coaches, the scripted dispatcher takes the call, for the rest of
 * the call. That makes a false positive expensive, so this list is narrower than NEVER_COACH:
 * imperative verbs in the forms an instruction uses ("stop", "stopping", never "stopped",
 * which only ever describes), and the interventions we never coach.
 */
const COACHING_VERB_FORMS = [
  'push', 'pushes', 'pushing', 'press', 'presses', 'pressing', 'compress', 'compressing',
  'stop', 'stopping', 'tilt', 'tilting', 'lift', 'lifting', 'roll', 'rolling', 'apply', 'applying',
  'wrap', 'wrapping', 'tie', 'tying', 'pull', 'pulling', 'squeeze', 'squeezing', 'slap', 'slapping',
  'hit', 'hitting', 'thrust', 'thrusts', 'thrusting', 'move him', 'move her', 'move them',
  'sit him', 'sit her', 'sit them', 'give him', 'give her', 'give them', 'clear his', 'clear her',
  'clear the', 'lay him', 'lay her', 'turn him', 'turn her',
];

/**
 * Interventions and body parts that only appear in a reply when it is coaching. Checked in
 * claims and commands, not in questions: "Is he breathing?" is the agent's own third question
 * and "Is the bleeding heavy?" is a fair one, while "Give him a breath" and "Push on his
 * chest" are not. Whole words, so "breathing" is not 'breath' and "heading" is not 'head'.
 */
const COACHING_NOUNS = [
  'rescue breath', 'rescue breaths', 'mouth to mouth', 'mouth-to-mouth', 'breathe into', 'breath', 'breaths',
  'aspirin', 'medication', 'medicine', 'nitroglycerin', 'epipen', 'defibrillator', 'aed', 'pulse',
  'tourniquet', 'find help', 'go get', 'pull it out', 'heartbeat', 'airway', 'stomach', 'belly',
  'abdomen', 'throat', 'mouth', 'chest', 'neck', 'head back', 'remove', 'water', 'drink',
  'take a break', 'take a rest', 'take a breather', 'pause',
];

const hasWord = (text: string, term: string): boolean => new RegExp(`\\b${escapeRegExp(term)}\\b`).test(text);

/**
 * True when free-form text reads like first-aid instruction: any coaching verb anywhere, or a
 * coaching noun outside a question. A false negative puts an unvalidated instruction in a
 * dispatcher's voice; a false positive hands the call to the script. Both lists are pinned
 * against the scripted dispatcher's own lines and the agent's mandated questions in tests.
 */
export function looksLikeCoaching(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const question = /\?\s*$/.test(sentence);
    const lower = sentence.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ');
    if (COACHING_VERB_FORMS.some((term) => hasWord(lower, term))) return true;
    if (!question && COACHING_NOUNS.some((term) => hasWord(lower, term))) return true;
  }
  return false;
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
  return new RegExp(`\\b${escapeRegExp(stem)}`).test(text);
}
