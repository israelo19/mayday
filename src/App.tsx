// App root, docs/05. Four screens (LAUNCH -> COACH -> SITREP -> HANDOFF) driven by mock data
// from src/ui/mockDemoData.ts until src/session.ts and P2's engine exist to drive them for
// real (see DECISIONS.md). `?debug=1` still gets the M0 debug view. Owned by P4 (docs/07).
import { useMemo, useState } from 'react';
import { createPerception } from './perception';
import { WebSpeechProvider } from './voice/out';
import { Metronome } from './voice/metronome';
import { DebugScreen } from './ui/DebugScreen';
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

export default function App() {
  const perception = useMemo(() => createPerception({ emaAlpha: 0.3 }), []);
  const speaker = useMemo(() => new WebSpeechProvider(1.05), []);
  const metronome = useMemo(() => new Metronome(), []);
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);

  const [screen, setScreen] = useState<Screen>('launch');
  const [stepIndex, setStepIndex] = useState(0);
  const [dispatcherOpen, setDispatcherOpen] = useState(false);

  if (debug) return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;

  function handleStart(): void {
    requestFullscreen();
    requestWakeLock();
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
