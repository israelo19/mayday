// Simulated 911 dispatcher, docs/07 P3 task 7: the SCRIPTED local stub. Deterministic,
// zero network, works with the wifi off; the caller renders its lines in the call panel,
// which reads "911 / On the line" and never labels itself, because the disclosure that the
// call-taker is not real lives on the LAUNCH screen (CLAUDE.md principle 5 - a human dials,
// we never touch a real line, and tests/boundaries.test.ts keeps the panel free of the
// word). The DispatcherSim
// shape lives in src/ai/dispatcher.ts and is pulled in type-only, which `npm run lint`'s
// AI-boundary check allows: a type has no runtime effect and can never place a call.
//
// The script mirrors a real call-taker's opening interrogation - location, nature, patient
// status - which is exactly the order of P2's SITREP read-aloud block, so the bystander
// can answer by reading the screen. Turns speak in the second voice at narration priority:
// a coaching critical always talks over the dispatcher, never the reverse.
// Owned by P3 (docs/07).
import type { DispatcherSim } from '../ai/dispatcher';
import type { Sitrep } from '../types';
import type { VoiceOutFull } from './out';

export const DISPATCHER_STATE = 'voice:dispatcher';

/** Asked in order, one per bystander reply. */
export const DISPATCHER_SCRIPT: readonly string[] = [
  '9 1 1, what is the address of your emergency?',
  'Okay. What happened? Tell me what you see.',
  'Is he awake? Is he breathing?',
  'Help is on the way. Keep following the coaching. Do not hang up.',
];

/** The first reply after the script is exhausted gets this once; the call-taker then stays quiet and on the line. */
export const DISPATCHER_ACK = 'Understood. Units are en route. Stay with him and keep going.';

/** What each scripted question is after, in the same order as DISPATCHER_SCRIPT. */
export type DispatcherWant = 'location' | 'what' | 'status' | 'none';
export const DISPATCHER_WANTS: readonly DispatcherWant[] = ['location', 'what', 'status', 'none'];

/**
 * Patient-status answers per protocol, keyed by machine. Statements the bystander can read
 * to the call-taker, chosen by the bystander; the app never picks one. Not instructions.
 */
const STATUS_REPLIES: Readonly<Record<string, (stateId: string) => string[]>> = {
  cardiac: (stateId) =>
    stateId === 'recovery_hold'
      ? ['He is breathing. I am staying with him.']
      : ['He is not breathing. I am doing chest compressions.', 'He is not responding.'],
  bleeding: () => ['He is awake. I am pressing on the wound.', 'He is not responding. I am pressing on the wound.'],
  choking: (stateId) =>
    stateId === 'resolved' ? ['It came out. He is breathing now.'] : ['He is awake but he cannot breathe.', 'He passed out.'],
};
const STATUS_FALLBACK = ['He is not breathing.', 'He is awake.'];

/**
 * The replies that answer the call-taker's latest question, from the SITREP: the address for
 * "where", the emergency and how long ago for "what happened", patient status for "is he
 * awake". Nothing to answer once the script is done, so the panel can fold.
 */
export function repliesFor(lastDispatcherLine: string | null, sitrep: Pick<Sitrep, 'readAloud' | 'currentState'> | null): string[] {
  const step = lastDispatcherLine === null ? -1 : DISPATCHER_SCRIPT.indexOf(lastDispatcherLine);
  const want: DispatcherWant = step < 0 ? 'none' : DISPATCHER_WANTS[step];
  const lines = sitrep?.readAloud ?? [];
  switch (want) {
    case 'location':
      return lines.slice(0, 1);
    case 'what':
      return [lines[1], lines.find((l) => l.startsWith('This started'))].filter((l): l is string => !!l);
    case 'status': {
      const [machineId, stateId] = (sitrep?.currentState ?? '').split('.');
      return (STATUS_REPLIES[machineId] ?? (() => STATUS_FALLBACK))(stateId ?? '');
    }
    default:
      return [];
  }
}

/** True once the dispatcher has nothing left to ask, so a panel can fold away and stop offering replies. */
export function dispatcherDone(lines: readonly string[]): boolean {
  const last = lines[lines.length - 1];
  return last === DISPATCHER_SCRIPT[DISPATCHER_SCRIPT.length - 1] || last === DISPATCHER_ACK;
}

export function createScriptedDispatcher(voice: Pick<VoiceOutFull, 'speakInternal'>): DispatcherSim {
  return {
    connect(onDispatcherLine: (t: string) => void) {
      let step = 0;
      let live = true;
      let acked = false;

      const say = (line: string): void => {
        onDispatcherLine(line); // the call panel shows the line
        voice.speakInternal({
          text: line,
          priority: 'narration',
          stateId: DISPATCHER_STATE,
          voice: 'dispatcher',
        });
      };

      say(DISPATCHER_SCRIPT[step]);
      step++;

      return {
        sayToDispatcher(_t: string): void {
          // The bystander's words are not parsed - this is a scripted simulation, and free
          // text has no authority anywhere (CLAUDE.md principle 1). Any reply advances.
          if (!live) return;
          if (step < DISPATCHER_SCRIPT.length) {
            say(DISPATCHER_SCRIPT[step]);
            step++;
          } else if (!acked) {
            // Once, not on every tap: a call-taker who repeats the same line forever reads as a
            // loop the bystander cannot escape, and the coaching underneath is what matters now.
            acked = true;
            say(DISPATCHER_ACK);
          }
        },
        hangup(): void {
          live = false;
        },
      };
    },
  };
}
