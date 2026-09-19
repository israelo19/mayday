// Pure beat math shared by the compression figure and the rhythm trace. No DOM, no
// React, so both draw from the same clock and stay in phase. Owned by P4.

// =============================================================================
// Module Overview
// =============================================================================
// `beatPhase` turns a clock reading into a 0..1 position within the current beat;
// `compressionDepth` turns that phase into how far down the chest is. The metronome
// tick is phase 0 and the chest is fully down on the tick, so the picture lands with
// the sound.

/** Position within the current beat, 0 on the tick, approaching 1 just before the next. */
export function beatPhase(nowMs: number, bpm: number, originMs = 0): number {
  if (!(bpm > 0)) throw new RangeError('`bpm` must be positive');
  const period = 60_000 / bpm;
  const into = (((nowMs - originMs) % period) + period) % period;
  return into / period;
}

/** Chest depth on a 0..1 scale: 1 (fully pushed) on the tick, 0 (fully released) halfway between ticks. */
export function compressionDepth(phase: number): number {
  return 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
}

/** Milliseconds per beat. */
export function beatPeriodMs(bpm: number): number {
  if (!(bpm > 0)) throw new RangeError('`bpm` must be positive');
  return 60_000 / bpm;
}
