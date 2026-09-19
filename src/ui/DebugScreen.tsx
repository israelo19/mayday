// M0 debug screen (docs/03 "Debug view"): camera + landmarks, live shoulder-y waveform,
// big rate number (placeholder until M1), confidence bar, voice and metronome test buttons.
// Owned by P1. The four product screens (docs/05) are P3's and live next to this file.
import { useCallback, useEffect, useState } from 'react';
import type { Perception, PerceptionStatus } from '../perception';
import type { WebSpeechProvider } from '../voice/out';
import type { Metronome } from '../voice/metronome';
import { CameraView } from './CameraView';
import { Waveform } from './Waveform';
import './debug.css';

const TEST_LINE = 'Mayday is ready. Push hard and fast, and follow my beat.';
const METRONOME_BPM = 110;

type Props = { perception: Perception; speaker: WebSpeechProvider; metronome: Metronome };

type Snapshot = {
  status: PerceptionStatus;
  error: string | null;
  fps: number;
  raw: number | null;
  facing: string;
  delegate: string | null;
  frame: string;
};

function snapshot(p: Perception): Snapshot {
  const size = p.debug.frameSize();
  return {
    status: p.debug.status(),
    error: p.debug.error(),
    fps: p.debug.fps(),
    raw: p.debug.raw(),
    facing: p.debug.facing(),
    delegate: p.debug.delegate(),
    frame: size ? `${size.width}x${size.height}` : '-',
  };
}

export function DebugScreen({ perception, speaker, metronome }: Props) {
  const [snap, setSnap] = useState<Snapshot>(() => snapshot(perception));
  const [confidence, setConfidence] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [metroOn, setMetroOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setSnap(snapshot(perception)), 100);
    return () => window.clearInterval(id);
  }, [perception]);

  useEffect(() => {
    let last = 0;
    return perception.subscribe((f) => {
      const now = performance.now();
      if (now - last < 100) return;
      last = now;
      setConfidence(f.poseConfidence);
    });
  }, [perception]);

  const source = useCallback(() => perception.debug.series(10_000), [perception]);
  const peaks = useCallback(() => perception.debug.peaks(), [perception]);
  const onCameraError = useCallback((err: unknown) => {
    setCameraError(err instanceof Error ? err.message : String(err));
  }, []);

  const testVoice = async () => {
    await metronome.unlock();
    setSpeaking(true);
    try {
      await speaker.speak(TEST_LINE);
    } finally {
      setSpeaking(false);
    }
  };

  const toggleMetronome = async () => {
    await metronome.unlock();
    if (metronome.isRunning()) {
      metronome.stop();
      setMetroOn(false);
    } else {
      metronome.start(METRONOME_BPM);
      setMetroOn(true);
    }
  };

  const retryCamera = () => {
    setCameraError(null);
    setCameraKey((k) => k + 1);
  };

  const confColor = confidence >= 0.5 ? 'var(--ok)' : confidence >= 0.3 ? 'var(--warn)' : 'var(--accent)';
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  return (
    <div className="debug">
      <header className="debug-header">
        <strong>Mayday</strong>
        <span className="muted">M0 debug · the minutes before the ambulance, coached</span>
      </header>

      <section className="debug-camera">
        <CameraView key={cameraKey} perception={perception} mirror={snap.facing === 'user'} onError={onCameraError} />
        {cameraError && (
          <div className="debug-error">
            <div>Camera: {cameraError}</div>
            <button onClick={retryCamera}>Retry camera</button>
          </div>
        )}
      </section>

      <section className="debug-metrics">
        <div className="metric">
          <div className="metric-value">&mdash;</div>
          <div className="metric-label">compressions / min (M1)</div>
        </div>
        <div className="metric">
          <div className="metric-value" style={{ color: confColor }}>
            {confidence.toFixed(2)}
          </div>
          <div className="metric-label">pose confidence (shoulders)</div>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${Math.round(confidence * 100)}%`, background: confColor }} />
          </div>
        </div>
      </section>

      <section className="debug-wave">
        <Waveform source={source} peaks={peaks} windowMs={10_000} height={170} />
      </section>

      <section className="debug-actions">
        <button className="primary" onClick={testVoice} disabled={speaking}>
          {speaking ? 'Speaking…' : 'Test voice'}
        </button>
        <button onClick={toggleMetronome}>{metroOn ? `Stop metronome (${METRONOME_BPM})` : `Metronome ${METRONOME_BPM} bpm`}</button>
      </section>

      <footer className="debug-status muted">
        <span>status: <b>{snap.status}</b></span>
        <span>{snap.fps} fps</span>
        <span>{snap.delegate ?? '-'} delegate</span>
        <span>{snap.frame}</span>
        <span>camera: {snap.facing}</span>
        <span>raw y: {snap.raw === null ? '-' : snap.raw.toFixed(3)}</span>
        <span>voice: {speaker.currentVoiceName() ?? 'default'}</span>
        <span>{online ? 'online' : 'OFFLINE (still works)'}</span>
        {snap.error && <span style={{ color: 'var(--accent)' }}>{snap.error}</span>}
      </footer>
    </div>
  );
}
