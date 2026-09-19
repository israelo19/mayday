// Phrase-level keyword spotting. P3's listener and the engine both call matchKeyword against
// engine.keywords(); no free text ever reaches the engine (docs/01 threat model). The matcher
// itself lives in language.ts, where the stemming and recognizer-error tolerance are tested.
export { matchKeyword, normalize, stem, stemKey, tokens } from './language';
