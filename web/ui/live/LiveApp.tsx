// The live app: LAUNCH, then the camera fills the screen and everything else floats on it
// (docs/05 COACH, redesigned per the team's Sat 04:00 direction). Every element on screen is
// read from the session snapshot; nothing here decides what to say. Owned by P4 (docs/07);
// first cut by P1 on the `listen` branch so the voice -> engine -> screen loop is demoable.
import { useEffect, useMemo, useState } from 'react';
import { createPerception, primeMediaPermissions, type Perception } from '../../../src/perception';
import { createFakePerception, isFakeRequested, type FakePerceptionHandle } from '../../../src/perception/fake';
import { canonicalLines, createSession, WATCHING_STATES, type Eyes } from '../../session';
import type { LiveSource } from '../guide';
import { reverseGeocode } from '../../geocode';
import { createVoice } from '../../../src/voice';
import { createAssessor, createDispatcher, createSpeaker, warmSpeaker } from '../../providers';
import type { Box, SceneAssessment } from '../../../src/types';
import { CameraView } from '../CameraView';
import { LaunchScreen } from '../LaunchScreen';
import { StepGuide, guideFor } from '../guide';
import { DispatcherPanel } from './DispatcherPanel';
import { FakeControls } from './FakeControls';
import { HandoffPanel } from './HandoffPanel';
import { isLooking, voiceOffLabel, type Platform } from './hints';
import { useSession } from './useSession';
import { installTrace, micTrace, traceRequested } from '../../trace';
import './live.css';

function readPlatform(): Platform {
  const nav = navigator as Navigator & { standalone?: boolean };
  return { standalone: nav.standalone === true, iOS: /iP(hone|ad|od)/.test(navigator.userAgent) };
}

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
  const speaker = useMemo(createSpeaker, []);
  const voice = useMemo(() => createVoice({ provider: speaker }), [speaker]);
  // The scene model, behind its flag; the fake rescuer's controls drive the stub (docs/04 item 7).
  const assessor = useMemo(
    () => createAssessor(fake ? { pick: () => (perception as FakePerceptionHandle).controls.scene } : null),
    [perception, fake],
  );
  const session = useMemo(
    () => createSession({ perception, voice, dispatcher: createDispatcher, reverseGeocode, micTrace: traceRequested() ? micTrace : undefined, assessor }),
    [perception, voice, assessor],
  );
  const snap = useSession(session);
  const platform = useMemo(readPlatform, []);
  // Triage opens on the camera: the question card and its buttons hold back for a moment so
  // the eyes get a look at the scene first (hints.ts). A tap on the look card ends it early.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [snap.stateKey]);
  const looking = isLooking({ phase: snap.phase, eyesStatus: snap.eyes.status, suggestion: snap.suggestion !== null, revealed, assessing: snap.assessing, sinceMs: Date.now() - snap.stateEnteredAt });
  // The bystander's own shoulder signal under the compression picture (docs/05 wiring). The real
  // module stamps samples with performance.now(); the fake one with Date.now(), so shift those.
  const live = useMemo<LiveSource>(() => {
    const shift = fake ? () => performance.now() - Date.now() : () => 0;
    return {
      series: () => {
        const d = shift();
        return d === 0 ? perception.debug.series(4000) : perception.debug.series(4000).map((s) => ({ t: s.t + d, y: s.y }));
      },
      peaks: () => {
        const d = shift();
        return d === 0 ? perception.debug.peaks() : perception.debug.peaks().map((t) => t + d);
      },
    };
  }, [perception, fake]);

  useEffect(() => {
    // Dev aid: `mayday.log.entries()` in the console shows what the session heard and did.
    (window as unknown as { mayday?: unknown }).mayday = session;
    const stopTrace = installTrace(session);
    return () => {
      stopTrace();
      session.stop();
    };
  }, [session]);

  if (snap.phase === 'idle') {
    return (
      <LaunchScreen
        onStart={() => {
          requestFullscreen();
          requestWakeLock();
          // Combined camera+mic prompt in this tap. CameraView's getUserMedia is video-only
          // and runs after paint, which is why iOS asked for the microphone on the next card.
          void primeMediaPermissions();
          session.start();
          warmSpeaker(speaker, canonicalLines());
        }}
      />
    );
  }

  return (
    <div className="live">
      <div className="live-camera">
        <CameraView perception={perception} mirror={perception.debug.facing() === 'user'} fill />
        {snap.phase === 'triage' && snap.assessment?.patient && (
          <SceneHud box={snap.assessment.patient} label={snap.assessment.label} frame={perception.debug.frameSize()} mirror={perception.debug.facing() === 'user'} />
        )}
      </div>
      {snap.phase === 'handoff' && <div className="live-dim" />}

      {/* One column, normal flow: chip row, eyes, metric, dispatcher. Nothing here overlaps anything
          else, and none of it is drawn over the handoff, which is the closing screen. */}
      {snap.phase !== 'handoff' && (
        <div className="live-top">
          <div className="live-top-row">
            <ListeningChip listening={snap.listening} speaking={snap.speaking} heard={snap.lastHeard} keyword={snap.lastKeyword} error={snap.listenError} platform={platform} onRetry={() => session.retryListening()} />
            <div className="live-top-right">
              {/* Every state keeps the button; states flagged call911 in the machine data make it pulse. It opens the SIMULATED dispatcher and never dials. */}
              <button className={`live-call${snap.call911 && !snap.callActive ? ' urgent' : ''}`} onClick={() => session.call911()} disabled={snap.callActive}>
                {snap.callActive ? 'On the line' : 'Call 911'}
              </button>
              {snap.callActive && <span className="live-sim">Simulated dispatcher</span>}
            </div>
          </div>
          <EyesChip eyes={snap.eyes} triage={snap.phase === 'triage'} assessing={snap.assessing} saw={snap.suggestion?.source === 'camera' ? (snap.assessment && snap.suggestion.heard.startsWith('camera: ') && snap.suggestion.heard.length > 44 ? snap.suggestion.label.toLowerCase() : snap.suggestion.heard.replace(/^camera: /, '')) : null} />
          <Metric snap={snap} />
          {snap.callActive && (
            <DispatcherPanel status={snap.dispatcherStatus} lines={snap.dispatcherLines} sitrep={snap.sitrep} onReply={(t) => session.replyToDispatcher(t)} onHangUp={() => session.hangUp()} />
          )}
        </div>
      )}

      {snap.phase === 'handoff' ? (
        <HandoffPanel snap={snap} session={session} />
      ) : (
        <div className="live-bottom">
          {/* Principle 4: a camera that is off is said, in every phase, not left as a black screen. */}
          {snap.eyes.status === 'error' && <div className="live-banner red">Camera off. Coaching by voice and buttons.</div>}
          {snap.phase === 'triage' && snap.assessment && (snap.assessment.scene !== '' || snap.assessment.label !== 'unclear') && (
            <SceneBanner assessment={snap.assessment} />
          )}
          {snap.suggestion && (
            <div className="live-banner amber live-suggest">
              <span className="live-suggest-text">
                {snap.suggestion.source === 'camera' && <EyeIcon />}
                {snap.suggestion.source === 'camera' ? 'Looks like ' : 'Sounds like '}
                <b>{snap.suggestion.label.toLowerCase()}?</b>
              </span>
              <span className="live-suggest-actions">
                <button type="button" onClick={() => session.confirmSuggestion()}>
                  Yes
                </button>
                <button type="button" onClick={() => session.rejectSuggestion()}>
                  No
                </button>
              </span>
            </div>
          )}
          {!snap.blind && snap.guidance && <div className="live-banner amber">{snap.guidance}</div>}
          {/* The engine's own line is the message. With a picture, the guide caption shows it; without one, the banner does. */}
          {snap.coaching && !guideFor(snap.stateKey ?? '') && (
            <div className={`live-banner ${snap.coaching.priority === 'critical' ? 'red' : 'amber'} big`}>{snap.coaching.text}</div>
          )}
          {snap.blind && !snap.coaching && snap.stateKey && WATCHING_STATES.has(snap.stateKey) && (
            <div className="live-banner red">Can't see you clearly. Coaching by voice.</div>
          )}

          {looking ? (
            <button type="button" className="live-look" onClick={() => setRevealed(true)}>
              <EyeIcon />
              <span>
                <b>Looking at the scene.</b> {snap.assessing ? 'One picture is with the model.' : 'Say what happened, or tap to choose.'}
              </span>
            </button>
          ) : (
            <>
              <Instruction snap={snap} live={live} />

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
            </>
          )}
        </div>
      )}

      {fake && <FakeControls perception={perception as FakePerceptionHandle} />}
    </div>
  );
}

function ListeningChip({ listening, speaking, heard, keyword, error, platform, onRetry }: { listening: string; speaking: boolean; heard: string | null; keyword: string | null; error: string | null; platform: Platform; onRetry: () => void }) {
  const on = listening === 'listening' || listening === 'restarting';
  const off = !on;
  // While the app talks the mic is muted for echo (docs/09), so say so: a judge who answers
  // over the prompt would otherwise think the app ignored them. Off, the label is the fix.
  const label = keyword
    ? `Heard: ${keyword}`
    : heard
      ? `“${heard}”`
      : speaking && on
        ? 'Speaking, then listening'
        : on
          ? 'Listening'
          : voiceOffLabel(error, platform, listening !== 'unavailable' || error !== null);
  // Off states are a button: iOS only grants recognition that starts inside a tap.
  return (
    <button type="button" className={`live-chip${on && !speaking ? ' live-chip-on' : ''}${keyword ? ' live-chip-hit' : ''}`} onClick={off ? onRetry : undefined} disabled={!off}>
      <span className="live-dot" />
      {label}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg className="live-eye" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

/** The scene model's answer, as the camera's own words on the screen; never spoken, never an instruction. */
function SceneBanner({ assessment }: { assessment: SceneAssessment }) {
  const cues = [
    ['awake', assessment.cues.awake],
    ['breathing', assessment.cues.breathing],
    ['pain', assessment.cues.pain],
  ]
    .filter(([, v]) => v !== 'unclear')
    .map(([k, v]) => `${k}: ${v}`);
  return (
    <div className="live-banner live-scene">
      <EyeIcon />
      <span>
        <b>Camera:</b> {assessment.scene || `looks like ${assessment.label}`}
        {cues.length > 0 && <span className="live-cues">{cues.join(' · ')}</span>}
      </span>
    </div>
  );
}

/**
 * The scene model's box for the person in trouble, drawn over the cover-cropped camera with
 * the same crop (slice), so it lands where the video shows the person.
 */
function SceneHud({ box, label, frame, mirror }: { box: Box; label: string; frame: { width: number; height: number } | null; mirror: boolean }) {
  if (!frame) return null;
  const x = (mirror ? 1 - box.x - box.w : box.x) * frame.width;
  const y = box.y * frame.height;
  const font = Math.max(12, Math.round(Math.min(frame.width, frame.height) / 30));
  const tagH = font * 1.6;
  const tagY = Math.max(0, y - tagH);
  const text = `patient · ${label}`;
  return (
    <svg className="live-hud" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect className="live-hud-box" x={x} y={y} width={box.w * frame.width} height={box.h * frame.height} rx={8} />
      <rect className="live-hud-tag" x={x} y={tagY} width={text.length * font * 0.62 + font} height={tagH} rx={6} />
      <text x={x + font * 0.5} y={tagY + font * 1.15} style={{ fontSize: font }}>
        {text}
      </text>
    </svg>
  );
}

/** What the camera is doing, in five words: the eyes are the product, so they get a line of their own. */
function EyesChip({ eyes, triage, assessing, saw }: { eyes: Eyes; triage: boolean; assessing: boolean; saw: string | null }) {
  // In triage the camera looks at the scene for the patient; while coaching it measures the helper.
  const label =
    eyes.saw ? `Saw: ${eyes.saw.toLowerCase()}`
    : saw ? `Saw: ${saw}`
    : assessing ? 'Assessing the scene'
    : eyes.status === 'error' ? 'Camera off'
    : eyes.status === 'starting' ? 'Starting camera'
    : eyes.status === 'off' ? 'Camera off'
    : eyes.hands === 'locked' ? 'Watching your hands on the wound'
    : eyes.hands === 'locking' ? 'Finding your hands'
    : eyes.hands === 'failed' ? 'Hands not found, coaching by voice'
    : triage ? (eyes.status === 'blind' ? 'Looking at the scene' : 'Someone in view')
    : eyes.status === 'blind' ? 'No one in view'
    : eyes.rescuer ? 'Watching you'
    : 'Watching';
  const tone = eyes.saw || saw ? 'hit' : eyes.status === 'watching' && (eyes.rescuer || eyes.hands === 'locked') ? 'on' : eyes.status === 'error' ? 'off' : '';
  return (
    <div className={`live-eyes${tone ? ` live-eyes-${tone}` : ''}`}>
      <EyeIcon />
      <span>{label}</span>
      {eyes.fps > 0 && <span className="live-eyes-fps">{eyes.fps} fps</span>}
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

/** How long a state's card stays open on its own: time to hear every line, plus a beat. */
const READ_MS_PER_LINE = 4500;
const READ_MS_EXTRA = 4000;

function Instruction({ snap, live }: { snap: ReturnType<typeof useSession>; live: LiveSource }) {
  const guide = snap.stateKey ? guideFor(snap.stateKey) : null;
  const line = snap.lines[Math.min(snap.lineIndex, Math.max(0, snap.lines.length - 1))] ?? '';
  // The camera is the point of the app (docs/05), so once a state has been read the card shrinks
  // to its caption and the rescuer is visible again. A correction reopens it; a tap toggles it.
  const [pinned, setPinned] = useState<'full' | 'slim' | null>(null);
  useEffect(() => setPinned(null), [snap.stateKey]);
  const readMs = READ_MS_EXTRA + READ_MS_PER_LINE * snap.lines.length;
  const autoFull = snap.phase === 'triage' || !!snap.coaching || Date.now() - snap.stateEnteredAt < readMs;
  const full = pinned ? pinned === 'full' : autoFull;
  const toggle = () => setPinned(full ? 'slim' : 'full');
  return (
    <div className={`live-card${full ? '' : ' slim'}`}>
      <button type="button" className="live-card-head" onClick={toggle} aria-expanded={full}>
        <span className="live-machine">{snap.machineLabel}</span>
        <span className="live-card-right">
          {snap.lines.length > 1 && (
            <span className="live-steps">
              {snap.lines.map((_, i) => (
                <i key={i} className={i <= snap.lineIndex ? 'on' : ''} />
              ))}
            </span>
          )}
          {guide && <span className="live-card-toggle">{full ? 'Hide picture' : 'Show picture'}</span>}
        </span>
      </button>
      {full && guide ? (
        <StepGuide guide={guide} step={snap.lineIndex} bpm={snap.metronomeBpm ?? undefined} beatOriginMs={snap.beatOriginMs} facts={snap.facts} coaching={snap.coaching} live={live} compact />
      ) : (
        <p className={`live-line${full ? '' : ' small'}`}>{snap.coaching && !full ? snap.coaching.text : line}</p>
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
