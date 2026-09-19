// The eyes screen: docs/03 "Debug view". Camera with the overlay, the live rate, the
// shoulder trace, and the controls P1 needs to tune perception on a real phone. This is
// the instrument panel, not a product screen; the four product screens (docs/05) are P4's.
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import type { PerceptionFacts } from '../../src/types';
import { DEFAULT_TUNING, TUNING_RANGES, type Perception, type PerceptionStatus, type Roi, type Tuning } from '../../src/perception';
import type { SpeakerProvider } from '../../src/voice/out';
import type { Metronome } from '../../src/voice/metronome';
import { CameraView } from './CameraView';
import { Waveform } from './Waveform';
import './debug.css';

const TEST_LINE = 'Mayday is ready. Push hard and fast, and follow my beat.';
const METRONOME_BPM = 110;
const TUNING_KEY = 'mayday.eyes.tuning';
const RATE_LOW = 100;
const RATE_HIGH = 120;

// Any SpeakerProvider, not the WebSpeech class: the debug view only speaks and names the voice.
type Props = { perception: Perception; speaker: SpeakerProvider & { currentVoiceName?(): string | null }; metronome: Metronome };

type Snapshot = {
  status: PerceptionStatus;
  error: string | null;
  fps: number;
  raw: number | null;
  facing: string;
  delegate: string | null;
  frame: string;
  source: 'camera' | 'replay' | null;
  mode: 'pose' | 'pose+hands';
  handsReady: boolean;
  blind: boolean;
  confidenceRaw: number;
  rateByCount: number | null;
  luma: number | null;
  choking: boolean;
  guidance: string | null;
  roi: Roi;
};

function snapshot(p: Perception): Snapshot {
  const d = p.debug;
  const size = d.frameSize();
  return {
    status: d.status(),
    error: d.error(),
    fps: d.fps(),
    raw: d.raw(),
    facing: d.facing(),
    delegate: d.delegate(),
    frame: size ? `${size.width}x${size.height}` : '',
    source: d.source(),
    mode: d.mode(),
    handsReady: d.handsReady(),
    blind: d.blind(),
    confidenceRaw: d.confidenceRaw(),
    rateByCount: d.rateByCount(),
    luma: d.luma(),
    choking: d.chokingGesture(),
    guidance: p.getCameraGuidance(),
    roi: p.roi(),
  };
}

const STATUS_LABEL: Record<PerceptionStatus, string> = {
  idle: 'Idle',
  'loading-model': 'Loading the model',
  'starting-camera': 'Starting the camera',
  running: 'Live',
  stopped: 'Stopped',
  error: 'Camera problem',
};

function loadTuning(): Partial<Tuning> {
  try {
    const raw = localStorage.getItem(TUNING_KEY);
    return raw ? (JSON.parse(raw) as Partial<Tuning>) : {};
  } catch {
    return {};
  }
}

function saveTuning(t: Tuning): void {
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(t));
  } catch {
    /* storage can be unavailable; tuning still applies for the session */
  }
}

function initialReplayUrl(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get('replay') ?? undefined;
  } catch {
    return undefined;
  }
}

export function DebugScreen({ perception, speaker, metronome }: Props) {
  const [snap, setSnap] = useState<Snapshot>(() => snapshot(perception));
  const [facts, setFacts] = useState<PerceptionFacts | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [replayUrl, setReplayUrl] = useState<string | undefined>(initialReplayUrl);
  const [metroOn, setMetroOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [tuning, setTuning] = useState<Tuning>(() => ({ ...DEFAULT_TUNING, ...loadTuning() }));

  // Apply saved tuning once, then keep the module in sync with the sliders.
  useEffect(() => {
    perception.debug.setTuning(tuning);
    saveTuning(perception.debug.tuning());
  }, [perception, tuning]);

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
      setFacts(f);
    });
  }, [perception]);

  // Keep the screen awake while the phone is propped up for a test.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        sentinel = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        /* not granted or unsupported; harmless */
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);

  const source = useCallback(() => perception.debug.series(10_000), [perception]);
  const peaks = useCallback(() => perception.debug.peaks(), [perception]);
  const onCameraError = useCallback((err: unknown) => {
    setCameraError(err instanceof Error ? err.message : String(err));
  }, []);

  const testVoice = () => {
    // No await before speak(): iOS only allows speech started inside the tap itself.
    void metronome.unlock();
    setSpeaking(true);
    const done = () => setSpeaking(false);
    speaker.speak(TEST_LINE).then(done, done);
    window.setTimeout(done, 10_000);
  };

  const toggleMetronome = () => {
    void metronome.unlock();
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

  const pickReplay = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (replayUrl?.startsWith('blob:')) URL.revokeObjectURL(replayUrl);
    setCameraError(null);
    setReplayUrl(URL.createObjectURL(file));
  };

  const useCamera = () => {
    if (replayUrl?.startsWith('blob:')) URL.revokeObjectURL(replayUrl);
    setCameraError(null);
    setReplayUrl(undefined);
  };

  const onTuning = (key: keyof Tuning) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setTuning((t) => ({ ...t, [key]: value }));
  };

  const rate = facts?.compressionRate ?? null;
  const active = facts?.compressionActive ?? false;
  const recoil = facts?.recoilRatio ?? null;
  const confidence = snap.confidenceRaw;
  const confColor = confidence >= 0.5 ? 'var(--trace)' : confidence >= 0.3 ? 'var(--amber)' : 'var(--red)';
  const inRange = rate !== null && rate >= RATE_LOW && rate <= RATE_HIGH;
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const banner = snap.blind
    ? { tone: 'red', text: "Can't see your shoulders. Coaching would switch to voice only." }
    : snap.guidance
      ? { tone: 'amber', text: snap.guidance }
      : null;

  const sourceLabel = snap.source === 'replay' ? 'Replaying a clip' : snap.facing === 'user' ? 'Front camera' : snap.facing === 'environment' ? 'Rear camera' : 'Camera';

  const roi = snap.roi;
  const roiLine =
    roi.state === 'locking'
      ? `Hold still on the wound, ${(roi.lockingMs / 1000).toFixed(1)} s`
      : roi.state === 'locked'
        ? roi.handsOn
          ? 'Hands on the wound'
          : `Hands off for ${((roi.handsOffMs ?? 0) / 1000).toFixed(1)} s`
        : roi.state === 'failed'
          ? 'No steady hands within 10 s. Coaching would continue by voice only.'
          : snap.mode === 'pose+hands'
            ? 'Press on the wound with both hands, then lock.'
            : 'Turn on hand tracking to test the bleeding module.';

  return (
    <div className="eyes">
      <header className="eyes-top">
        <div className="wordmark">
          Mayday <span>eyes</span>
        </div>
        <div className="chips">
          <span className={`chip${snap.status === 'running' ? ' live' : ''}`}>{STATUS_LABEL[snap.status]}</span>
          {snap.status === 'running' && <span className="chip">{snap.fps} fps</span>}
        </div>
      </header>

      <div className="cam-wrap">
        <CameraView key={`${cameraKey}:${replayUrl ?? 'camera'}`} perception={perception} mirror={snap.facing === 'user'} replayUrl={replayUrl} onError={onCameraError}>
          <div className="hud-row">
            <span className="chip dark">{sourceLabel}</span>
            {snap.mode === 'pose+hands' && <span className="chip dark">{snap.handsReady ? 'Tracking hands' : 'Loading hand model'}</span>}
            {snap.choking && <span className="chip dark amber">Hands at the throat</span>}
          </div>
          {banner && <div className={`banner ${banner.tone}`}>{banner.text}</div>}
        </CameraView>
        {cameraError && (
          <div className="cam-error">
            <p>{cameraError}</p>
            <div className="row">
              <button onClick={retryCamera}>Try again</button>
              {replayUrl && <button onClick={useCamera}>Use the camera</button>}
            </div>
          </div>
        )}
      </div>

      <section className="strip">
        <div>
          {rate === null ? (
            <div className="rate-value none">{snap.blind ? 'No signal while blind' : active ? 'Counting pushes' : 'Waiting for pushes'}</div>
          ) : (
            <div className={`rate-value${inRange ? '' : ' off'}`}>{rate}</div>
          )}
          <div className="label">compressions per minute</div>
        </div>
        <div>
          <div className={`pulse${active ? ' on' : ''}`} />
          <div className="label">{active ? 'pushing' : 'still'}</div>
        </div>
        <div>
          <div className="conf-value" style={{ color: confColor }}>
            {confidence.toFixed(2)}
          </div>
          <div className="conf-bar">
            <div className="conf-fill" style={{ width: `${Math.round(confidence * 100)}%`, background: confColor }} />
          </div>
          <div className="label">shoulders seen</div>
        </div>
      </section>
      <div className="aside">
        <span>recoil {recoil === null ? 'n/a' : recoil.toFixed(2)}</span>
        <span>10 s count {snap.rateByCount ?? 'n/a'}</span>
        <span>target {RATE_LOW} to {RATE_HIGH}</span>
      </div>

      <section className="trace">
        <Waveform source={source} peaks={peaks} windowMs={10_000} height={170} note={snap.blind ? 'No signal while blind' : undefined} />
      </section>

      <details className="panel">
        <summary>Tune the detector</summary>
        <div className="panel-body">
          {(Object.keys(TUNING_RANGES) as (keyof Tuning)[]).map((key) => {
            const r = TUNING_RANGES[key];
            const label = key === 'emaAlpha' ? 'Smoothing' : key === 'prominence' ? 'Minimum push size' : 'Minimum gap between pushes';
            const shown = key === 'refractoryMs' ? `${tuning[key]} ms` : tuning[key].toFixed(3);
            return (
              <label key={key} className="slider">
                <span>
                  {label} <b>{shown}</b>
                </span>
                <input type="range" min={r.min} max={r.max} step={r.step} value={tuning[key]} onChange={onTuning(key)} />
              </label>
            );
          })}
          <div className="row">
            <button className="ghost" onClick={() => setTuning({ ...DEFAULT_TUNING })}>
              Reset tuning
            </button>
          </div>
        </div>
      </details>

      <details className="panel">
        <summary>Hands and the wound region</summary>
        <div className="panel-body">
          <p className="hint">{roiLine}</p>
          <div className="row">
            <button className="ghost" onClick={() => perception.setMode(snap.mode === 'pose' ? 'pose+hands' : 'pose')}>
              {snap.mode === 'pose' ? 'Track hands' : 'Stop tracking hands'}
            </button>
            {snap.mode === 'pose+hands' && roi.state !== 'locked' && roi.state !== 'locking' && (
              <button className="ghost" onClick={() => perception.lockRoi()} disabled={!snap.handsReady}>
                Lock on the hands
              </button>
            )}
            {(roi.state === 'locked' || roi.state === 'locking') && (
              <button className="ghost" onClick={() => perception.unlockRoi()}>
                Release
              </button>
            )}
          </div>
        </div>
      </details>

      <details className="panel">
        <summary>Replay a clip</summary>
        <div className="panel-body">
          <p className="hint">Run a recorded video through the same pipeline to tune without a live person. Or open the page with ?replay=/fixtures/clip.webm.</p>
          <div className="row">
            <label className="file">
              Choose a video
              <input type="file" accept="video/*" onChange={pickReplay} />
            </label>
            {snap.source === 'replay' && (
              <button className="ghost" onClick={useCamera}>
                Use the camera
              </button>
            )}
          </div>
        </div>
      </details>

      <footer className="foot">
        <span>{snap.delegate ? `${snap.delegate} delegate` : 'no delegate yet'}</span>
        {snap.frame && <span>{snap.frame}</span>}
        <span>raw y {snap.raw === null ? 'none' : snap.raw.toFixed(3)}</span>
        <span>light {snap.luma ?? 'n/a'}</span>
        <span>voice {speaker.currentVoiceName?.() ?? 'default'}</span>
        <span>{online ? 'online' : 'offline, still working'}</span>
        {snap.error && <span className="err">{snap.error}</span>}
      </footer>

      <div className="actions">
        <button className="go" onClick={testVoice} disabled={speaking}>
          {speaking ? 'Speaking' : 'Speak a test line'}
        </button>
        <button onClick={toggleMetronome}>{metroOn ? 'Stop the beat' : `Start the beat, ${METRONOME_BPM}`}</button>
      </div>
    </div>
  );
}
