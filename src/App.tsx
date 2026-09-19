// App root, docs/05. `?guide` opens the step guide gallery (src/ui/guide), `?debug=1` the M0
// eyes screen, `?fake=1` the live app on a pretend rescuer. Otherwise the live app: LAUNCH,
// then the camera fills the screen and the session (src/session.ts) drives everything on it
// from the protocol engine. The mock-data screens from the first cut stay in src/ui for P4 to
// fold into the live layout. Owned by P4 (docs/07).
import { useMemo } from 'react';
import { createPerception } from './perception';
import { WebSpeechProvider } from './voice/out';
import { Metronome } from './voice/metronome';
import { DebugScreen } from './ui/DebugScreen';
import { GuideGallery } from './ui/guide';
import { LiveApp } from './ui/live/LiveApp';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const guide = params.get('guide');
  if (guide !== null) return <GuideGallery initialKey={guide} />;
  if (params.has('debug')) return <EyesDebug />;
  return <LiveApp />;
}

function EyesDebug() {
  const perception = useMemo(() => createPerception(), []);
  const speaker = useMemo(() => new WebSpeechProvider(1.05), []);
  const metronome = useMemo(() => new Metronome(), []);
  return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;
}
