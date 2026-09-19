// App root, docs/05 + design proposal (see DECISIONS.md). `?guide` opens the step guide
// gallery (web/ui/guide), the local test surface for the protocol pictures (P2/P3). `?debug=1`
// gets the M0 debug view. Otherwise: LAUNCH -> TRIAGE -> (Yes/talk) CALL PREP -> COACH ->
// SITREP -> HANDOFF, driven by mock data from web/ui/mockDemoData.ts until web/session.ts and
// P2's engine exist to drive it for real. Owned by P4 (docs/07).
import { useEffect, useMemo, useState } from 'react';
import { createPerception } from '../src/perception';
import { createVoice } from '../src/voice';
import { WebSpeechProvider } from '../src/voice/out';
import { Metronome } from '../src/voice/metronome';
import { DebugScreen } from './ui/DebugScreen';
import { GuideGallery } from './ui/guide';
import { LaunchScreen } from './ui/LaunchScreen';
import { TriageScreen } from './ui/TriageScreen';
import { BleedingStub } from './ui/BleedingStub';
import { CallPrepScreen } from './ui/CallPrepScreen';
import { CoachScreen } from './ui/CoachScreen';
import { SitrepScreen } from './ui/SitrepScreen';
import { HandoffScreen } from './ui/HandoffScreen';
import { MOCK_COACH_STEPS, MOCK_HANDOFF, MOCK_SITREP, type MockBranch } from './ui/mockDemoData';

type Screen = 'launch' | 'triage' | 'bleeding' | 'callPrep' | 'coach' | 'sitrep' | 'handoff';

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
  // The one voice surface (docs/07, src/voice/index.ts): queue, keyword listener with echo
  // suppression, dispatcher sim, all sharing `speaker`/`metronome` so ?debug=1 sees the same
  // instances.
  const voice = useMemo(() => createVoice({ provider: speaker, metronome }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);

  const [screen, setScreen] = useState<Screen>('launch');
  const [stepIndex, setStepIndex] = useState(0);
  const [dispatcherOpen, setDispatcherOpen] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [wantsCall, setWantsCall] = useState(false);

  useEffect(() => {
    if (!dispatcherOpen) return;
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [dispatcherOpen]);

  if (debug) return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;

  function enterCoaching(): void {
    requestFullscreen();
    requestWakeLock();
    setStepIndex(0);
    setScreen('coach');
  }

  function handleTriageCardiac(): void {
    if (wantsCall) setScreen('callPrep');
    else enterCoaching();
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

  function handleBranch(b: MockBranch): void {
    if (b.onSelect === 'handoff') setScreen('sitrep');
    else setScreen('launch');
  }

  switch (screen) {
    case 'launch':
      return (
        <LaunchScreen
          onNeedHelp={() => {
            requestFullscreen();
            void voice.out.unlock();
            setWantsCall(true);
            setScreen('triage');
          }}
          onNotYet={() => {
            requestFullscreen();
            void voice.out.unlock();
            setWantsCall(false);
            setScreen('triage');
          }}
        />
      );
    case 'triage':
      return <TriageScreen voice={voice} onCardiac={handleTriageCardiac} onBleeding={() => setScreen('bleeding')} />;
    case 'bleeding':
      return <BleedingStub onCall911={handleCall911} onBack={() => setScreen('triage')} />;
    case 'callPrep':
      return (
        <CallPrepScreen
          sitrep={MOCK_SITREP.callPrep}
          onCall911={handleCall911}
          onStartGuidance={enterCoaching}
          onBack={() => setScreen('triage')}
        />
      );
    case 'coach':
      return (
        <CoachScreen
          perception={perception}
          voice={voice}
          step={MOCK_COACH_STEPS[stepIndex]}
          dispatcherOpen={dispatcherOpen}
          callSeconds={callSeconds}
          onCall911={handleCall911}
          onNext={handleNext}
          onBranch={handleBranch}
        />
      );
    case 'sitrep':
      return <SitrepScreen speaker={speaker} sitrep={MOCK_SITREP} onNext={() => setScreen('handoff')} />;
    case 'handoff':
      return <HandoffScreen handoff={MOCK_HANDOFF} />;
  }
}
