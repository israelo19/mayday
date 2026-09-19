// The live app: LAUNCH, then the camera fills the screen and everything else floats on it
// (docs/05 COACH, redesigned per the team's Sat 04:00 direction). Every element on screen is
// read from the session snapshot; nothing here decides what to say. Owned by P4 (docs/07);
// first cut by P1 on the `listen` branch so the voice -> engine -> screen loop is demoable.
import { useEffect, useMemo } from 'react';
import { createPerception, type Perception } from '../../../src/perception';
import { createFakePerception, isFakeRequested, type FakePerceptionHandle } from '../../../src/perception/fake';
import { createSession, WATCHING_STATES } from '../../session';
import { createVoice } from '../../../src/voice';
import { CameraView } from '../CameraView';
import { LaunchScreen } from '../LaunchScreen';
import { StepGuide, guideFor } from '../guide';
import { DispatcherPanel } from './DispatcherPanel';
import { FakeControls } from './FakeControls';
import { HandoffPanel } from './HandoffPanel';
import { useSession } from './useSession';
import './live.css';

function requestWakeLock(): void {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } };
  nav.wakeLock?.request('screen').catch(() => {});
}

function requestFullscreen(): void {
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export function LiveApp() {
  const fake = useMemo(() => isFakeRequested(), []);
  const perception = useMemo<Perception>(() => (fake ? createFakePerception() : createPerception()), [fake]);
  const voice = useMemo(() => createVoice(), []);
  const session = useMemo(() => createSession({ perception, voice }), [perception, voice]);
  const snap = useSession(session);

  useEffect(() => {
    // Dev aid: `mayday.log.entries()` in the console shows what the session heard and did.
    (window as unknown as { mayday?: unknown }).mayday = session;
    return () => session.stop();
  }, [session]);

  if (snap.phase === 'idle') {
    return (
      <LaunchScreen
        onStart={() => {
          requestFullscreen();
          requestWakeLock();
          session.start();
        }}
      />
    );
  }

  return (
    <div className="live">
      <div className="live-camera">
        <CameraView perception={perception} mirror={perception.debug.facing() === 'user'} fill />
      </div>
      {snap.phase === 'handoff' && <div className="live-dim" />}

      <div className="live-top">
        <ListeningChip listening={snap.listening} heard={snap.lastHeard} keyword={snap.lastKeyword} />
        <div className="live-top-right">
          <button className="live-call" onClick={() => session.call911()} disabled={snap.callActive}>
            {snap.callActive ? 'On the line' : 'Call 911'}
          </button>
          {snap.callActive && <span className="live-sim">Simulated dispatcher</span>}
        </div>
      </div>

      {snap.phase !== 'handoff' && <Metric snap={snap} />}

      {snap.callActive && <DispatcherPanel lines={snap.dispatcherLines} sitrep={snap.sitrep} onReply={(t) => session.replyToDispatcher(t)} onHangUp={() => session.hangUp()} />}

      {snap.phase === 'handoff' ? (
        <HandoffPanel snap={snap} session={session} />
      ) : (
        <div className="live-bottom">
          {!snap.blind && snap.guidance && <div className="live-banner amber">{snap.guidance}</div>}
          {/* The engine's own line is the message. With a picture, the guide caption shows it; without one, the banner does. */}
          {snap.coaching && !guideFor(snap.stateKey ?? '') && (
            <div className={`live-banner ${snap.coaching.priority === 'critical' ? 'red' : 'amber'} big`}>{snap.coaching.text}</div>
          )}
          {snap.blind && !snap.coaching && snap.stateKey && WATCHING_STATES.has(snap.stateKey) && (
            <div className="live-banner red">Can't see you clearly. Coaching by voice.</div>
          )}

          <Instruction snap={snap} />

          <div className="live-twins">
            {snap.twins.map((tw) => (
              <button key={tw.keyword} className={`live-twin${snap.phase === 'triage' ? ' triage' : ''}`} onClick={() => session.say(tw.keyword)}>
                {tw.label}
              </button>
            ))}
          </div>

          <div className="live-actions">
            {snap.phase === 'coaching' && (
              <button className="live-ghost" onClick={() => session.finish()}>
                Ambulance is here
              </button>
            )}
            <button className="live-next" onClick={() => session.advance()} disabled={!snap.canAdvance}>
              Next
            </button>
          </div>
        </div>
      )}

      {fake && <FakeControls perception={perception as FakePerceptionHandle} />}
    </div>
  );
}

function ListeningChip({ listening, heard, keyword }: { listening: string; heard: string | null; keyword: string | null }) {
  const label =
    keyword ? `Heard: ${keyword}` : heard ? `“${heard}”` : listening === 'listening' ? 'Listening' : listening === 'unavailable' ? 'Voice off, use the buttons' : listening === 'restarting' ? 'Listening' : 'Mic off';
  return (
    <div className={`live-chip${listening === 'listening' || listening === 'restarting' ? ' live-chip-on' : ''}${keyword ? ' live-chip-hit' : ''}`}>
      <span className="live-dot" />
      {label}
    </div>
  );
}

function Metric({ snap }: { snap: ReturnType<typeof useSession> }) {
  const key = snap.stateKey ?? '';
  const f = snap.facts;
  if (key === 'cardiac.compressions') {
    const rate = !snap.blind && f?.compressionRate != null ? f.compressionRate : null;
    const ok = rate !== null && rate >= 100 && rate <= 120;
    return (
      <div className={`live-metric${rate === null ? '' : ok ? ' ok' : ' off'}`}>
        <div className="live-metric-value">{rate === null ? (f?.compressionActive ? '…' : '—') : rate}</div>
        <div className="live-metric-label">{rate === null ? 'per minute' : 'per minute, aim 100 to 120'}</div>
      </div>
    );
  }
  if (key === 'bleeding.pressure' || key === 'bleeding.pack') {
    const ms = snap.sitrep?.metrics.continuousPressureMs ?? 0;
    const on = f?.handsOnRegion;
    return (
      <div className={`live-metric${on === true ? ' ok' : on === false ? ' off' : ''}`}>
        <div className="live-metric-value">{formatClock(ms)}</div>
        <div className="live-metric-label">{on === false ? 'hands off the wound' : on === true ? 'pressure held' : 'pressure timer'}</div>
      </div>
    );
  }
  return null;
}

function Instruction({ snap }: { snap: ReturnType<typeof useSession> }) {
  const guide = snap.stateKey ? guideFor(snap.stateKey) : null;
  const line = snap.lines[Math.min(snap.lineIndex, Math.max(0, snap.lines.length - 1))] ?? '';
  return (
    <div className="live-card">
      <div className="live-card-head">
        <span className="live-machine">{snap.machineLabel}</span>
        {snap.lines.length > 1 && (
          <span className="live-steps">
            {snap.lines.map((_, i) => (
              <i key={i} className={i <= snap.lineIndex ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>
      {guide ? (
        <StepGuide guide={guide} step={snap.lineIndex} bpm={snap.metronomeBpm ?? undefined} beatOriginMs={snap.beatOriginMs} facts={snap.facts} coaching={snap.coaching} compact />
      ) : (
        <p className="live-line">{line}</p>
      )}
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
