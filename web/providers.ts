// The flagged voice upgrades (docs/04 items 2 and 3, docs/09), chosen once per session and
// handed to the session through the seams the voice module already has: the queue takes any
// SpeakerProvider through createVoice({ provider }), and the dispatcher panel takes any
// DispatcherSim. Defaults stay local; every upgrade keeps its offline stub underneath.
// Owned by P4 (docs/07).
import { createSceneAssessor, createStubSceneAssessor, type SceneAssessor } from '../src/ai/assess';
import { createIntentRouter, createStubIntentRouter, type IntentRouter } from '../src/ai/intent';
import type { DispatcherSim } from '../src/ai/dispatcher';
import { flags } from '../src/flags';
import type { SceneLabel } from '../src/types';
import { WebSpeechProvider, type SpeakerProvider } from '../src/voice/out';
import { ElevenLabsProvider } from '../src/voice/providers/elevenlabs';
import { createAgentDispatcher, type AgentDispatcherStatus } from '../src/voice/providers/elevenlabs-agent';
import { COACH_VOICE_ID, COACH_VOICE_NAME, DISPATCHER_VOICE_ID } from '../src/voice/providers/voices';

/** WebSpeech always; ElevenLabs on top of it only behind its flag, so the default stays local. */
export function createSpeaker(): SpeakerProvider {
  const webSpeech = new WebSpeechProvider(1.05);
  if (!flags.elevenLabs) return webSpeech;
  return new ElevenLabsProvider({
    voiceId: COACH_VOICE_ID,
    voiceName: COACH_VOICE_NAME,
    dispatcherVoiceId: DISPATCHER_VOICE_ID,
    fallback: webSpeech,
  });
}

/** The scripted call-taker speaks through the queue; the ElevenLabs agent, behind its flag, wraps it as the fallback. */
export function createDispatcher(
  scripted: DispatcherSim,
  hooks: { onStatus: (s: AgentDispatcherStatus) => void; onTranscript: (t: string) => void },
): { dispatcher: DispatcherSim; status: 'scripted' | 'connecting' } {
  if (!flags.dispatcherSim) return { dispatcher: scripted, status: 'scripted' };
  return { dispatcher: createAgentDispatcher({ fallback: scripted, ...hooks }), status: 'connecting' };
}

/**
 * One frame to a scene model behind its flag (docs/04 item 7, docs/11). `?fake=1` gets the
 * canned assessor driven by the fake controls, so the flow demos with no key.
 */
export function createAssessor(fake: { pick: () => SceneLabel } | null): SceneAssessor | undefined {
  if (!flags.sceneAssess) return undefined;
  return fake ? createStubSceneAssessor(fake.pick) : createSceneAssessor();
}

/**
 * A missed sentence to a text model behind its flag (docs/04 item 8). `?fake=1` gets a word
 * overlap stub, so the yes/no flow demos with no key.
 */
export function createRouter(fake: boolean): IntentRouter | undefined {
  if (!flags.intentRoute) return undefined;
  return fake ? createStubIntentRouter() : createIntentRouter();
}

/** Warm the ElevenLabs cache with every line the machines can say, so replays are free and offline (docs/09). */
export function warmSpeaker(speaker: SpeakerProvider, lines: readonly string[]): void {
  if (speaker instanceof ElevenLabsProvider) void speaker.warm(lines);
}
