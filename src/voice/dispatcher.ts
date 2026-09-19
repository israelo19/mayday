// Simulated 911 dispatcher, docs/07 P3 task 7: the SCRIPTED local stub. Deterministic,
// zero network, works with the wifi off; the caller renders the big red SIMULATED banner
// (CLAUDE.md principle 5 - a human dials, we never touch a real line). The DispatcherSim
// shape lives in src/ai/dispatcher.ts and is pulled in type-only, which `npm run lint`'s
// AI-boundary check allows: a type has no runtime effect and can never place a call.
//
// The script mirrors a real call-taker's opening interrogation - location, nature, patient
// status - which is exactly the order of P2's SITREP read-aloud block, so the bystander
// can answer by reading the screen. Turns speak in the second voice at narration priority:
// a coaching critical always talks over the dispatcher, never the reverse.
// Owned by P3 (docs/07).
import type { DispatcherSim } from '../ai/dispatcher';
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
        onDispatcherLine(line); // the panel shows the line under the SIMULATED banner
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
