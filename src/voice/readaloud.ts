// SITREP read-aloud, docs/07 P3 task 6: the app speaks P2's "Say this to the dispatcher"
// block on tap, one line at a time, while coaching continues. It rides the same queue at
// narration priority, so a coaching critical always interrupts it and the interrupted
// line replays; its lines carry a voice-internal stateId, so a protocol state change never
// drops them as stale. Owned by P3 (docs/07).
import type { VoiceOutFull } from './out';

export const READALOUD_STATE = 'voice:readaloud';

export interface ReadAloud {
  /** Replaces any previous run and starts speaking from the first line. */
  start(lines: readonly string[]): void;
  /** The current line finishes, the next one does not start. */
  pause(): void;
  resume(): void;
  stop(): void;
  /** True from start() until the last line has been spoken (or stop()). */
  isActive(): boolean;
  /** 0-based index of the line being spoken, for the SITREP screen to highlight. */
  position(): number;
}

export function createReadAloud(voice: Pick<VoiceOutFull, 'speakInternal'>): ReadAloud {
  let lines: readonly string[] = [];
  let index = 0;
  let paused = false;
  let active = false;
  let inFlight = false;
  /** start() during an old run must orphan the old onDone chain. */
  let run = 0;

  function next(): void {
    if (!active || paused || inFlight) return;
    if (index >= lines.length) {
      active = false;
      return;
    }
    const myRun = run;
    inFlight = true;
    voice.speakInternal({
      text: lines[index],
      priority: 'narration',
      stateId: READALOUD_STATE,
      onDone: () => {
        if (myRun !== run) return; // a newer run took over
        inFlight = false;
        index++;
        next();
      },
    });
  }

  return {
    start(newLines: readonly string[]): void {
      run++;
      lines = newLines;
      index = 0;
      paused = false;
      inFlight = false;
      active = newLines.length > 0;
      next();
    },
    pause(): void {
      paused = true;
    },
    resume(): void {
      if (!paused) return;
      paused = false;
      next();
    },
    stop(): void {
      run++;
      active = false;
      inFlight = false;
      lines = [];
      index = 0;
    },
    isActive(): boolean {
      return active;
    },
    position(): number {
      return index;
    },
  };
}
