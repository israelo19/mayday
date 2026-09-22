// The one surface the orchestrator wires (docs/07 seams, docs/09-voice.md for the how-to).
// createVoice() assembles the queue, listener, metronome, latency log, SITREP read-aloud
// and the scripted dispatcher with the echo-suppression plumbing already connected, so the
// orchestrator never needs to know the 700 ms rule exists. Owned by P3 (docs/07).
import type { DispatcherSim } from '../ai/dispatcher';
import { createScriptedDispatcher } from './dispatcher';
import { createVoiceIn, type VoiceIn, type VoiceInOptions } from './in';
import { createLatencyLog, type LatencyStats } from './latency';
import { Metronome } from './metronome';
import { createReadAloud, type ReadAloud } from './readaloud';
import { createVoiceOut, WebSpeechProvider, type SpeakerProvider, type VoiceOutFull } from './out';

export type { CoachingEvent } from '../types';
export { chunkForSpeech } from './chunk';
export { createScriptedDispatcher, dispatcherDone, repliesFor, DISPATCHER_ACK, DISPATCHER_SCRIPT, DISPATCHER_WANTS } from './dispatcher';
export type { DispatcherWant } from './dispatcher';
export { createVoiceIn, isEchoOf, normalizeTranscript, spotKeyword } from './in';
export type { VoiceIn, VoiceInOptions, VoiceInStatus } from './in';
export { createLatencyLog } from './latency';
export type { LatencyStats } from './latency';
export { Metronome } from './metronome';
export { createReadAloud, READALOUD_STATE } from './readaloud';
export type { ReadAloud } from './readaloud';
export {
  createVoiceOut,
  DEFAULT_COOLDOWN_MS,
  VOICE_STATE_PREFIX,
  WebSpeechProvider,
} from './out';
export type { SpeakerProvider, SpeakOptions, VoiceOut, VoiceOutFull } from './out';

/** Results arriving this soon after our own speech ended are still probably our own echo. */
export const ECHO_TAIL_MS = 700;

export type Voice = {
  /** The queue: enqueue CoachingEvents, drive the metronome, unlock inside the first tap. */
  out: VoiceOutFull;
  /** Keyword spotting; suppress() and the echo text gate are already wired to `out`. */
  in: VoiceIn;
  /** Speaks the "Say this to the dispatcher" block, pausable, yields to criticals. */
  readAloud: ReadAloud;
  /** The scripted, offline dispatcher sim. Its lines go to the call panel ("911 / On the line"); the LAUNCH screen carries the disclosure. */
  dispatcher: DispatcherSim;
  /** Fact-to-audible latency percentiles for the debug panel and docs/latency.md. */
  stats(): LatencyStats;
  /** start `in` with echo suppression composed in; pass keywords + engine callbacks. */
  listen(o: Omit<VoiceInOptions, 'suppress' | 'echoText'>): void;
  stopListening(): void;
};

export type CreateVoiceOptions = {
  /** Default WebSpeech; ElevenLabs arrives later via out.setProvider() behind its flag. */
  provider?: SpeakerProvider;
  metronome?: Metronome;
};

export function createVoice(opts?: CreateVoiceOptions): Voice {
  const metronome = opts?.metronome ?? new Metronome();
  const provider = opts?.provider ?? new WebSpeechProvider(1.05);
  const latency = createLatencyLog();

  const out = createVoiceOut({
    provider,
    metronome,
    onSpoken: (e, latencyMs) => {
      if (latencyMs !== null) latency.record(e.priority, latencyMs);
    },
  });

  const voiceIn = createVoiceIn();

  return {
    out,
    in: voiceIn,
    readAloud: createReadAloud(out),
    dispatcher: createScriptedDispatcher(out),
    stats: () => latency.stats(),
    listen(o): void {
      voiceIn.start({
        ...o,
        // Layer 1: the app is speaking, or stopped so recently the mic may still hear it.
        suppress: () => out.isSpeaking() || out.quietForMs() < ECHO_TAIL_MS,
        // Layer 2: our own recent lines, for the near-verbatim readback gate.
        echoText: () => out.recentlySpoken(),
      });
    },
    stopListening(): void {
      voiceIn.stop();
    },
  };
}
