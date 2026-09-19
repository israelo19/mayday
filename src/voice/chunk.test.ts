// Chrome cuts long utterances silently; chunking is what keeps a long instruction audible
// to its last word. Pure function, pure tests.
import { describe, expect, it } from 'vitest';
import { chunkForSpeech, MAX_UTTERANCE_CHARS } from './chunk';

describe('chunkForSpeech', () => {
  it('passes short text through untouched', () => {
    expect(chunkForSpeech('Push hard and fast.')).toEqual(['Push hard and fast.']);
  });

  it('returns nothing for whitespace', () => {
    expect(chunkForSpeech('   ')).toEqual([]);
  });

  it('splits long text at sentence ends, every chunk within the limit', () => {
    const sentence = 'Put the heel of one hand on the center of his chest, between the nipples.';
    const text = Array(5).fill(sentence).join(' '); // ~375 chars
    const chunks = chunkForSpeech(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(MAX_UTTERANCE_CHARS);
      // Sentence-boundary splits: every chunk ends where a sentence does.
      expect(c.endsWith('.')).toBe(true);
    }
  });

  it('falls back to clause breaks, then spaces, and never loses a word', () => {
    const words = Array(60).fill('word').join(' '); // 299 chars, no sentence end
    const chunks = chunkForSpeech(words);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_UTTERANCE_CHARS);
    expect(chunks.join(' ').split(' ')).toEqual(words.split(' '));
  });

  it('hard-cuts a single unbroken run rather than exceeding the limit', () => {
    const run = 'x'.repeat(450);
    const chunks = chunkForSpeech(run);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(MAX_UTTERANCE_CHARS);
    expect(chunks.join('')).toBe(run);
  });
});
