import { describe, expect, it } from 'vitest';
import { DISPATCHER_ACK, DISPATCHER_SCRIPT, repliesFor } from './dispatcher';

const sitrep = {
  readAloud: [
    'My location is 3400 North Charles Street, Baltimore, Maryland 21218.',
    'Severe bleeding. Direct pressure in progress.',
    'This started 25 seconds ago.',
    'I have held pressure for 20 seconds.',
  ],
  currentState: 'bleeding.pressure',
};

describe('repliesFor', () => {
  it('answers the address question with the address only', () => {
    expect(repliesFor(DISPATCHER_SCRIPT[0], sitrep)).toEqual([sitrep.readAloud[0]]);
  });

  it('answers "what happened" with the emergency and how long ago', () => {
    expect(repliesFor(DISPATCHER_SCRIPT[1], sitrep)).toEqual([sitrep.readAloud[1], 'This started 25 seconds ago.']);
  });

  it('answers the status question per protocol, with the bystander choosing', () => {
    expect(repliesFor(DISPATCHER_SCRIPT[2], sitrep)).toEqual(['He is awake. I am pressing on the wound.', 'He is not responding. I am pressing on the wound.']);
    expect(repliesFor(DISPATCHER_SCRIPT[2], { ...sitrep, currentState: 'cardiac.compressions' })[0]).toContain('not breathing');
    expect(repliesFor(DISPATCHER_SCRIPT[2], { ...sitrep, currentState: 'cardiac.recovery_hold' })).toEqual(['He is breathing. I am staying with him.']);
    expect(repliesFor(DISPATCHER_SCRIPT[2], { ...sitrep, currentState: 'choking.back_blows' })).toEqual(['He is awake but he cannot breathe.', 'He passed out.']);
  });

  it('offers nothing once the script is done or before it starts', () => {
    expect(repliesFor(DISPATCHER_SCRIPT[3], sitrep)).toEqual([]);
    expect(repliesFor(DISPATCHER_ACK, sitrep)).toEqual([]);
    expect(repliesFor(null, sitrep)).toEqual([]);
  });

  it('never offers a missing line', () => {
    expect(repliesFor(DISPATCHER_SCRIPT[1], { readAloud: ['no fix', 'Medical emergency.'], currentState: 'not started' })).toEqual(['Medical emergency.']);
    expect(repliesFor(DISPATCHER_SCRIPT[0], null)).toEqual([]);
  });
});
