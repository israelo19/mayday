// App root. M0 renders the debug screen only. The session orchestrator (src/session.ts, P4)
// and the four product screens (docs/05) arrive in M1/M2. `?guide` opens the step guide
// gallery (src/ui/guide), the local test surface for the protocol pictures.
import { useMemo } from 'react';
import { createPerception } from './perception';
import { WebSpeechProvider } from './voice/out';
import { Metronome } from './voice/metronome';
import { DebugScreen } from './ui/DebugScreen';
import { GuideGallery } from './ui/guide';

export default function App() {
  const guide = new URLSearchParams(window.location.search).get('guide');
  if (guide !== null) return <GuideGallery initialKey={guide} />;
  return <DebugApp />;
}

/** The M0 debug screen with its camera, speaker and metronome, created once. */
function DebugApp() {
  const perception = useMemo(() => createPerception({ emaAlpha: 0.3 }), []);
  const speaker = useMemo(() => new WebSpeechProvider(1.05), []);
  const metronome = useMemo(() => new Metronome(), []);
  return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;
}
