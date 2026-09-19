// App root. M0 renders the debug screen only. The session orchestrator (src/session.ts, P3)
// and the four product screens (docs/05) arrive in M1/M2.
import { useMemo } from 'react';
import { createPerception } from './perception';
import { WebSpeechProvider } from './voice/out';
import { Metronome } from './voice/metronome';
import { DebugScreen } from './ui/DebugScreen';

export default function App() {
  const perception = useMemo(() => createPerception({ emaAlpha: 0.3 }), []);
  const speaker = useMemo(() => new WebSpeechProvider(1.05), []);
  const metronome = useMemo(() => new Metronome(), []);
  return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;
}
