import { describe, expect, it } from 'vitest';
import { matchKeyword, sameWord, stem, tokens } from '../src/protocol/language';

describe('stemming', () => {
  it('folds the inflections of the words the machines use', () => {
    for (const w of ['choke', 'choked', 'chokes', 'choking']) expect(stem(w)).toBe('chok');
    for (const w of ['bleed', 'bleeds', 'bleeding']) expect(stem(w)).toBe('bleed');
    for (const w of ['breathe', 'breathing', 'breaths']) expect(stem(w)).toBe('breath');
    for (const w of ['stab', 'stabbed', 'stabbing']) expect(stem(w)).toBe('stab');
    for (const w of ['collapse', 'collapsed', 'collapsing']) expect(stem(w)).toBe('collaps');
  });

  it('leaves the short answer words alone', () => {
    for (const w of ['no', 'not', 'yes', 'out', 'cut', 'shot', 'gun']) expect(stem(w)).toBe(w);
  });

  it('does not mangle singular words that end in s', () => {
    expect(stem('yes')).toBe('yes');
    expect(stem('unconscious')).toBe('unconscious');
    expect(stem('this')).toBe('this');
  });
});

describe('word comparison', () => {
  it('tolerates one recognizer error on long words only', () => {
    expect(sameWord('breeth', 'breath')).toBe(true); // "breething"
    expect(sameWord('shot', 'shoot')).toBe(false); // an answer word stays exact
    expect(sameWord('not', 'no')).toBe(false);
    expect(sameWord('shot', 'shop')).toBe(false);
    expect(sameWord('blood', 'bloody')).toBe(true);
  });
});

describe('matchKeyword', () => {
  const triage = ['not breathing', 'choking', 'shot', 'gunshot', 'bleeding', "can't breathe", 'no'];

  it('hears inflections and typos the way a person means them', () => {
    expect(matchKeyword('she choked on something', triage)).toBe('choking');
    expect(matchKeyword('he chokes', triage)).toBe('choking');
    expect(matchKeyword('there was a gunshot', triage)).toBe('gunshot');
    expect(matchKeyword('he bleeds a lot', triage)).toBe('bleeding');
    expect(matchKeyword('he cant breath', triage)).toBe("can't breathe");
    expect(matchKeyword("he's not breething", triage)).toBe('not breathing');
  });

  it('keeps the old guarantees', () => {
    expect(matchKeyword('he has no response', ['no', 'no response'])).toBe('no response');
    expect(matchKeyword('he is not breathing', ['no'])).toBeNull();
    expect(matchKeyword('the shotgun is gone', ['shot'])).toBeNull();
    expect(matchKeyword('hes not breathing', ["he's breathing", 'not breathing'])).toBe('not breathing');
    expect(matchKeyword('I am scared and I do not know what to do', ['not breathing'])).toBeNull();
  });

  it('does not treat a negated word as the affirmative keyword', () => {
    // "it's not safe" must not walk someone toward a gunshot; "he's not coughing"
    // must not route a silent choking patient to "let him cough".
    expect(matchKeyword("it's not safe", ['safe', "it's safe", "i'm safe"])).toBeNull();
    expect(matchKeyword("he's not coughing", ['coughing', "can't cough", 'he can cough'])).toBeNull();
    expect(matchKeyword('I am not safe', ['safe', "i'm safe"])).toBeNull();
  });

  it('still hears the affirmative, and a keyword that is itself a negation', () => {
    expect(matchKeyword('safe', ['safe', "it's safe"])).toBe('safe');
    expect(matchKeyword('he is coughing', ['coughing', "can't cough"])).toBe('coughing');
    expect(matchKeyword("he's not breathing", ['not breathing', 'no'])).toBe('not breathing');
    expect(matchKeyword('cannot cough', ['coughing', "can't cough", 'cannot cough'])).toBe('cannot cough');
  });

  it('tokenizes without apostrophes so both spellings meet', () => {
    expect(tokens("can't breathe")).toEqual(['cant', 'breath']);
    expect(tokens('cant breathe')).toEqual(['cant', 'breath']);
  });

  it('lets filler words sit inside a phrase the way people actually say it', () => {
    expect(matchKeyword('the ambulance is here', ['ambulance here'])).toBe('ambulance here');
    expect(matchKeyword('the ambulance just got here', ['ambulance here'])).toBe('ambulance here');
    expect(matchKeyword('the blood is soaking right through', ['blood soaking through'])).toBe('blood soaking through');
    expect(matchKeyword('something is stuck', ['something stuck'])).toBe('something stuck');
  });

  it('never lets a gap flip the meaning', () => {
    // A negation inside the gap kills the match: "is not here" must not mean here.
    expect(matchKeyword('the ambulance is not here yet', ['ambulance here'])).toBeNull();
    expect(matchKeyword('he is still not bleeding', ['still bleeding'])).toBeNull();
    // A phrase that starts with a negation gets no slack at all: with a gap,
    // "no, there's a pulse" would read as 'no pulse' and mean the opposite.
    expect(matchKeyword('no theres a pulse', ['no pulse'])).toBeNull();
    expect(matchKeyword('there is no pulse', ['no pulse'])).toBe('no pulse');
  });

  it('hears the wider family of negations', () => {
    expect(matchKeyword("he didn't collapse", ['collapsed'])).toBeNull();
    expect(matchKeyword("she doesn't breathe", ['breathing'])).toBeNull();
    expect(matchKeyword("he won't stop bleeding", ['still bleeding', 'bleeding'])).toBe('bleeding');
  });
});
