// App root, docs/05 + design proposal (see DECISIONS.md). `?guide` opens the step guide
// gallery (src/ui/guide), the local test surface for the protocol pictures (P2/P3). `?debug=1`
// gets the M0 debug view. Otherwise: LAUNCH -> (Yes/talk) CALL PREP -> COACH -> SITREP ->
// HANDOFF, driven by mock data from src/ui/mockDemoData.ts until src/session.ts and P2's
// engine exist to drive it for real. Owned by P4 (docs/07).
import { useEffect, useMemo, useState } from 'react';
import { createPerception } from './perception';
import { WebSpeechProvider } from './voice/out';
import { Metronome } from './voice/metronome';
import { DebugScreen } from './ui/DebugScreen';
import { GuideGallery } from './ui/guide';
import { LaunchScreen } from './ui/LaunchScreen';
import { CallPrepScreen } from './ui/CallPrepScreen';
import { CoachScreen } from './ui/CoachScreen';
import { SitrepScreen } from './ui/SitrepScreen';
import { HandoffScreen } from './ui/HandoffScreen';
import { MOCK_COACH_STEPS, MOCK_HANDOFF, MOCK_SITREP } from './ui/mockDemoData';

type Screen = 'launch' | 'callPrep' | 'coach' | 'sitrep' | 'handoff';

/** Screen Wake Lock so a propped phone never sleeps mid-coaching (docs/05). Best-effort: not
 * every browser has it, and it can be refused; coaching must never depend on it. */
function requestWakeLock(): void {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } };
  nav.wakeLock?.request('screen').catch(() => {});
}

/** Fullscreen on launch (docs/05), fired from a real user gesture so browsers allow it. */
function requestFullscreen(): void {
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export default function App() {
  const guide = new URLSearchParams(window.location.search).get('guide');
  if (guide !== null) return <GuideGallery initialKey={guide} />;
  return <MaydayApp />;
}

function MaydayApp() {
  const perception = useMemo(() => createPerception(), []);
  const speaker = useMemo(() => new WebSpeechProvider(1.05), []);
  const metronome = useMemo(() => new Metronome(), []);
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);

  const [screen, setScreen] = useState<Screen>('launch');
  const [stepIndex, setStepIndex] = useState(0);
  const [dispatcherOpen, setDispatcherOpen] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    if (!dispatcherOpen) return;
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [dispatcherOpen]);

  if (debug) return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;

  function enterCoaching(): void {
    requestFullscreen();
    requestWakeLock();
    setScreen('coach');
  }

  function handleCall911(): void {
    navigator.vibrate?.(200);
    setCallSeconds(0);
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
      return (
        <LaunchScreen
          onNeedHelp={() => {
            requestFullscreen();
            setScreen('callPrep');
          }}
          onNotYet={enterCoaching}
        />
      );
    case 'callPrep':
      return (
        <CallPrepScreen
          sitrep={MOCK_SITREP.callPrep}
          onCall911={handleCall911}
          onStartGuidance={enterCoaching}
          onBack={() => setScreen('launch')}
        />
      );
    case 'coach':
      return (
        <CoachScreen
          perception={perception}
          step={MOCK_COACH_STEPS[stepIndex]}
          dispatcherOpen={dispatcherOpen}
          callSeconds={callSeconds}
          onCall911={handleCall911}
          onNext={handleNext}
        />
      );
    case 'sitrep':
      return <SitrepScreen speaker={speaker} sitrep={MOCK_SITREP} onNext={() => setScreen('handoff')} />;
    case 'handoff':
      return <HandoffScreen handoff={MOCK_HANDOFF} />;
  }
}
