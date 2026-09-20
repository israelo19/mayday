// Understanding what a panicked bystander says, deterministically. This is still keyword
// spotting (docs/01 threat model row 1): no model, no network, no free text reaching the
// engine. What it adds over exact phrases is tolerance for how people actually talk:
//   - a light stemmer, so "choke", "choked", "choking" and "chokes" are one word;
//   - recognizer-error tolerance, one letter of difference between two long words;
//   - apostrophes ignored ("hes not breathing", "cant breathe");
//   - word-bounded phrase matching, longest phrase first, so 'no' never wins over
//     'no response' and 'shot' never fires inside 'shotgun';
//   - up to two filler words inside a phrase ("the ambulance IS here" is 'ambulance here'),
//     except in phrases that start with a negation, and never across a negation;
//   - a keyword that is not itself a negation is skipped when the word before it is
//     no/not/never/can't/don't, so "it's not safe" does not mean safe.
// Pure and tested in tests/language.test.ts. Owned by P2 (docs/07); built on `polish`.

/** Words the trailing-s rule must leave alone: singular words that end in s. */
const KEEP_S = new Set(['yes', 'this', 'was', 'has', 'his', 'is', 'us', 'gas', 'bus', 'plus', 'less', 'unless', 'does', 'goes', 'always', 'ems', 'cpr']);

/** Lowercase, drop apostrophes, punctuation to spaces, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A light English stemmer: enough to fold inflections of the words in the machines, never
 * clever enough to merge two different words. Short words are left alone on purpose:
 * "no", "not", "yes", "out", "cut" and "shot" carry the meaning of an answer.
 */
const hasVowel = (s: string): boolean => /[aeiou]/.test(s);

export function stem(word: string): string {
  let w = word;
  let suffixed = false;
  if (w.length >= 5) {
    // A suffix only comes off when a real stem is left: "bring" keeps its -ing, "bleed" its -ed.
    suffixed = true;
    if (w.endsWith('ing') && hasVowel(w.slice(0, -3)) && w.length - 3 >= 3) w = w.slice(0, -3);
    else if (w.endsWith('ied')) w = `${w.slice(0, -3)}y`;
    else if (w.endsWith('ed') && !w.endsWith('eed') && hasVowel(w.slice(0, -2))) w = w.slice(0, -2);
    else if (w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
    else if (w.endsWith('e')) w = w.slice(0, -1);
    else suffixed = false;
  }
  // A plural s comes off the original word only; "collapse" -> "collaps" must not lose its s again.
  if (!suffixed && w.length >= 4 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is') && !KEEP_S.has(word)) {
    w = w.slice(0, -1);
  }
  // "stabb" -> "stab", "hitt" -> "hit"; a doubled consonant only ever comes from a suffix.
  if (w.length >= 4 && w[w.length - 1] === w[w.length - 2] && !/[aeiou]/.test(w[w.length - 1])) w = w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter(Boolean)
    .map(stem);
}

/** Levenshtein distance, only ever called on short stems. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Two stems of five letters or more tolerate one letter of recognizer error; anything shorter
 * must be exact. The onset must match: a substituted first letter does not turn a word into a
 * misheard version of itself, it turns it into a different real word, and that word routes to
 * the wrong protocol. "he can't make a sound" and "I found him on the floor" both reached
 * `wound` and opened severe bleeding on a choking and a collapse; "flood" reached `blood` the
 * same way. A recognizer error inside a word ("breething", "bloody") keeps its onset, so the
 * tolerance that matters is untouched.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a[0] !== b[0]) return false;
  return distance(a, b) <= 1;
}

/**
 * Words that flip the next keyword. Apostrophes are already gone by the time we see tokens,
 * so "can't" and "don't" arrive as "cant" / "dont". A keyword that itself starts with one
 * of these ("not breathing", "can't cough") is not flipped: the negation is the keyword.
 */
const NEGATION = new Set(['no', 'not', 'never', 'cant', 'cannot', 'dont', 'doesnt', 'didnt', 'isnt', 'wont', 'couldnt', 'aint']);

/**
 * Filler words a speaker drops inside a phrase: "the ambulance IS here" must still be
 * 'ambulance here'. Only this many, only between the phrase's words, and never a negation
 * ("the ambulance is not here" stays unmatched). Phrases that START with a negation get no
 * slack at all: with a gap, "no, there's a pulse" would read as 'no pulse' and mean the
 * exact opposite of what was said.
 */
const MAX_GAP = 2;

/** True when `phrase` occurs in `text` as whole words in order (both already tokenized). */
export function containsTokens(text: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > text.length) return false;
  const gap = NEGATION.has(phrase[0]) ? 0 : MAX_GAP;
  outer: for (let i = 0; i + phrase.length <= text.length; i++) {
    if (!sameWord(text[i], phrase[0])) continue;
    let at = i;
    for (let j = 1; j < phrase.length; j++) {
      const found = nextWithin(text, at + 1, phrase[j], gap);
      if (found < 0) continue outer;
      at = found;
    }
    if (negatedAt(text, i, phrase)) continue;
    return true;
  }
  return false;
}

/** Index of `word` at `from`..`from+gap` in `text`, or -1; a negation in the gap aborts. */
function nextWithin(text: readonly string[], from: number, word: string, gap: number): number {
  for (let k = from; k <= from + gap && k < text.length; k++) {
    if (sameWord(text[k], word)) return k;
    if (NEGATION.has(text[k])) return -1;
  }
  return -1;
}

/**
 * True when the word at `i` is flipped by a negation directly before it. One word of lookback,
 * the same reach `negatedAt` gives a phrase, so the cue scorer and the keyword matcher agree
 * about what "no blood" and "not choking" mean.
 */
export function negatedWord(text: readonly string[], i: number): boolean {
  return i > 0 && NEGATION.has(text[i - 1]);
}

function negatedAt(text: readonly string[], start: number, phrase: readonly string[]): boolean {
  if (start === 0) return false;
  const prev = text[start - 1];
  if (!NEGATION.has(prev)) return false;
  return !sameWord(phrase[0], prev);
}

/**
 * The longest keyword present in the transcript, or null. Same contract as before: the
 * keyword comes back exactly as the caller listed it. Longest first is what keeps 'no
 * response' from being swallowed by 'no' when a state offers both (docs/07 decision 4).
 */
export function matchKeyword(transcript: string, keywords: readonly string[]): string | null {
  const text = tokens(transcript);
  if (text.length === 0) return null;
  const candidates = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of candidates) {
    if (containsTokens(text, tokens(keyword))) return keyword;
  }
  return null;
}

/** Two keywords that stem to the same tokens would be one keyword twice; the linter refuses them. */
export function stemKey(keyword: string): string {
  return tokens(keyword).join(' ');
}
