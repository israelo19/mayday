// Text chunking for speech synthesis, docs/07 P3 task 2. Chrome's speechSynthesis silently
// cuts utterances that run long (seen anywhere past ~200 characters), and a cut line is the
// one unacceptable state: half an instruction, no error event, nobody told. Long text is
// split into chunks a real engine finishes, preferring sentence ends so the pauses land
// where a human would breathe. Owned by P3 (docs/07).

/** Longest text handed to the engine as one utterance. */
export const MAX_UTTERANCE_CHARS = 200;

/** Last sentence end (., !, ?, optionally followed by a quote/bracket) inside `window`. */
function lastSentenceEnd(window: string): number {
  const re = /[.!?]["')\]]?(?=\s)/g;
  let end = -1;
  for (let m = re.exec(window); m !== null; m = re.exec(window)) end = m.index + m[0].length;
  return end;
}

/** Last clause break (, ; :) inside `window`. */
function lastClauseEnd(window: string): number {
  const re = /[,;:](?=\s)/g;
  let end = -1;
  for (let m = re.exec(window); m !== null; m = re.exec(window)) end = m.index + 1;
  return end;
}

/**
 * Split `text` into speakable chunks of at most `max` characters, cutting at the best
 * boundary available: sentence end, then clause break, then any space, then a hard cut.
 * Chunks come back trimmed and non-empty; short text passes through untouched.
 */
export function chunkForSpeech(text: string, max = MAX_UTTERANCE_CHARS): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = lastSentenceEnd(window);
    if (cut < 1) cut = lastClauseEnd(window);
    if (cut < 1) cut = window.lastIndexOf(' ');
    if (cut < 1) cut = max; // one unbroken run of characters: hard cut, still audible
    const piece = rest.slice(0, cut).trim();
    if (piece.length > 0) out.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}
