// App root, docs/05. `?guide` opens the step guide gallery (web/ui/guide), `?debug=1` the M0
// eyes screen, `?fake=1` the live app on a pretend rescuer. Otherwise the live app: LAUNCH,
// then the camera fills the screen and the session (web/session.ts) drives everything on it
// from the protocol engine. Flags (src/flags.ts): `elevenLabs` swaps the speaker for the
// ElevenLabs voice through the key proxy, `dispatcherSim` makes CALL 911 a live ElevenLabs
// agent that hears the phone mic; both keep their local stub underneath (web/providers.ts,
// docs/09). The first-cut mock screens are gone; LaunchScreen is the only survivor. Owned by P4 (docs/07).
import { useMemo } from 'react';
import { createPerception } from '../src/perception';
import { Metronome } from '../src/voice/metronome';
import { configureCoachVoice, createSpeaker } from './providers';
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
  const speaker = useMemo(() => {
    const s = createSpeaker();
    void configureCoachVoice(s); // the voice chip then names the configured coach voice
    return s;
  }, []);
  const metronome = useMemo(() => new Metronome(), []);
  return <DebugScreen perception={perception} speaker={speaker} metronome={metronome} />;
}
