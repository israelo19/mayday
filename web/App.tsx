// App root, docs/05. `?guide` opens the step guide gallery (web/ui/guide), the local test
// surface for the protocol pictures (P2/P3). `?debug=1` gets the M0 debug view. Otherwise:
// four screens (LAUNCH -> COACH -> SITREP -> HANDOFF) driven by mock data from
// web/ui/mockDemoData.ts until web/session.ts and P2's engine exist to drive them for real
// (see DECISIONS.md). `?flag=elevenLabs` swaps the speaker for the ElevenLabs voice through
// the key proxy (docs/09), WebSpeech underneath it as the fallback. Owned by P4 (docs/07).
import { useEffect, useMemo, useState } from 'react';
import { flags } from '../src/flags';
import { createPerception } from '../src/perception';
import { WebSpeechProvider, type SpeakerProvider } from '../src/voice/out';
import { ElevenLabsProvider } from '../src/voice/providers/elevenlabs';
import { COACH_VOICE_ID, COACH_VOICE_NAME, DISPATCHER_VOICE_ID } from '../src/voice/providers/voices';
import { Metronome } from '../src/voice/metronome';
import { DebugScreen } from './ui/DebugScreen';
import { GuideGallery } from './ui/guide';
import { LaunchScreen } from './ui/LaunchScreen';
import { CoachScreen } from './ui/CoachScreen';
import { SitrepScreen } from './ui/SitrepScreen';
import { HandoffScreen } from './ui/HandoffScreen';
import { MOCK_COACH_STEPS, MOCK_HANDOFF, MOCK_SITREP } from './ui/mockDemoData';

type Screen = 'launch' | 'coach' | 'sitrep' | 'handoff';

/** Screen Wake Lock so a propped phone never sleeps mid-coaching (docs/05). Best-effort: not
 * every browser has it, and it can be refused; coaching must never depend on it. */
function requestWakeLock(): void {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } };
  nav.wakeLock?.request('screen').catch(() => {});
}

/** Fullscreen on launch (docs/05), fired from the LAUNCH tap so it's a real user gesture. */
function requestFullscreen(): void {
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/** WebSpeech always; ElevenLabs on top of it only behind its flag, so the default stays local. */
function createSpeaker(): SpeakerProvider {
  const webSpeech = new WebSpeechProvider(1.05);
  if (!flags.elevenLabs) return webSpeech;
  return new ElevenLabsProvider({
    voiceId: COACH_VOICE_ID,
    voiceName: COACH_VOICE_NAME,
    dispatcherVoiceId: DISPATCHER_VOICE_ID,
    fallback: webSpeech,
  });
}

export default function App() {
  const guide = new URLSearchParams(window.location.search).get('guide');
  if (guide !== null) return <GuideGallery initialKey={guide} />;
  return <MaydayApp />;
}

function MaydayApp() {
  const perception = useMemo(() => createPerception(), []);
  const speaker = useMemo(createSpeaker, []);
  const metronome = useMemo(() => new Metronome(), []);
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);

  const [screen, setScreen] = useState<Screen>('launch');
  const [stepIndex, setStepIndex] = useState(0);
  const [dispatcherOpen, setDispatcherOpen] = useState(false);

  // Each coach step is spoken once on entry, the way session.ts will enqueue CoachingEvents.
  useEffect(() => {
    if (screen !== 'coach') return;
    speaker.cancel();
    void speaker.speak(MOCK_COACH_STEPS[stepIndex].line);
  }, [screen, stepIndex, speaker]);

  if (debug) return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;

  function handleStart(): void {
    requestFullscreen();
    requestWakeLock();
    // Audio unlocks inside the tap itself (docs/09): later lines arrive from fetches, not taps.
    void speaker.unlock?.();
    if (speaker instanceof ElevenLabsProvider) {
      void speaker.warm(MOCK_COACH_STEPS.map((s) => s.line));
    }
    setScreen('coach');
  }

  function handleCall911(): void {
    navigator.vibrate?.(200);
    setDispatcherOpen(true);
  }

  function handleNext(): void {
    if (stepIndex < MOCK_COACH_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setScreen('sitrep');
    }
  }

  switch (screen) {
    case 'launch':
      return <LaunchScreen onStart={handleStart} />;
    case 'coach': {
      const step = MOCK_COACH_STEPS[stepIndex];
      return (
        <CoachScreen
          perception={perception}
          line={step.line}
          metricLabel={step.metricLabel}
          metricValue={step.metricValue}
          dispatcherOpen={dispatcherOpen}
          onCall911={handleCall911}
          onNext={handleNext}
        />
      );
    }
    case 'sitrep':
      return <SitrepScreen speaker={speaker} sitrep={MOCK_SITREP} onNext={() => setScreen('handoff')} />;
    case 'handoff':
      return <HandoffScreen handoff={MOCK_HANDOFF} />;
  }
}
