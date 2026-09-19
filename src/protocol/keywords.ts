// Phrase-level keyword spotting. P3's listener feeds raw transcripts in here against
// engine.keywords(); no free text ever reaches the engine (docs/01 threat model).

/** Lowercase, strip punctuation that speech recognition sprinkles in, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'") // curly apostrophes from some recognizers
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `phrase` appears in `text` on word boundaries, so 'no' does not match inside
 * 'not breathing' and 'breath' does not match inside 'breathing'.
 */
function containsPhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9'])${escapeRegex(phrase)}(?:$|[^a-z0-9'])`);
  return pattern.test(` ${text} `);
}

/**
 * The longest keyword present in the transcript, or null. Longest first is what keeps
 * 'no response' from being swallowed by 'no' when a state offers both (docs/07 decision 4).
 */
export function matchKeyword(transcript: string, keywords: readonly string[]): string | null {
  const text = normalize(transcript);
  if (!text) return null;
  const stripped = text.replace(/'/g, '');
  const candidates = [...keywords].sort((a, b) => b.length - a.length);
  for (const keyword of candidates) {
    const phrase = normalize(keyword);
    if (containsPhrase(text, phrase)) return keyword;
    // Recognizers drop apostrophes inconsistently: "hes not breathing" for "he's not breathing".
    if (phrase.includes("'") && containsPhrase(stripped, phrase.replace(/'/g, ''))) return keyword;
  }
  return null;
}
