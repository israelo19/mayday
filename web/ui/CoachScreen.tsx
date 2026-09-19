// COACH screen, design proposal (see DECISIONS.md), camera-app layout: the live camera fills
// the screen like a viewfinder, with controls floating on top and bottom, instead of a small
// thumbnail. Reasoning: this app's whole differentiator is on-device vision (CLAUDE.md
// principle 2), and a bystander reading pose/hand-placement guidance benefits from actually
// seeing the patient large, not a postage-stamp preview. The hand-placement step now overlays
// a target reticle on the real camera feed instead of an abstract stick-figure illustration --
// once the real body is visible, a cartoon of one is redundant.
// The dispatcher indicator is ALWAYS labeled SIMULATED, including once "connected" -- CLAUDE.md
// principle 5 / docs/05 require the sim to never read as a real 911 line at any point.
// The mic FAB is real, not decorative: it toggles P3's `voice.listen()` and routes "next"/
// "repeat" the same way a button tap would (docs/05 "judge-proof": voice is always optional).
// `step` will come from session.ts/P2's engine (CoachingEvent) once it exists; App.tsx feeds
// mock data (web/ui/mockDemoData.ts) for now. Owned by P4.
import { useEffect, useState } from 'react';
import { CameraView } from './CameraView';
import type { Perception } from '../../src/perception';
import type { Voice, VoiceInStatus } from '../../src/voice';
import type { MockBranch, MockCoachStep } from './mockDemoData';
import './coach.css';

type Props = {
  perception: Perception;
  voice: Voice;
  step: MockCoachStep;
  dispatcherOpen: boolean;
  callSeconds: number;
  onCall911: () => void;
  onNext: () => void;
  onBranch: (b: MockBranch) => void;
};

const KEYWORDS = ['next', 'repeat'] as const;

export function CoachScreen({ perception, voice, step, dispatcherOpen, callSeconds, onCall911, onNext, onBranch }: Props) {
  const [status, setStatus] = useState<VoiceInStatus | 'idle'>('idle');
  const [heard, setHeard] = useState<string | null>(null);

  function startListening(): void {
    voice.listen({
      keywords: () => KEYWORDS,
      onKeyword: (k) => (k === 'next' ? onNext() : voice.out.enqueue({ priority: 'narration', text: step.line, stateId: 'mock-coach' })),
      onTranscript: setHeard,
      onStatus: setStatus,
    });
  }

  useEffect(() => {
    startListening();
    return () => voice.stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listening = status === 'listening' || status === 'restarting';

  function toggleMic(): void {
    if (listening) voice.stopListening();
    else startListening();
  }

  return (
    <div className="coach-fullscreen">
      <CameraView perception={perception} mirror={false}>
        <div className="coach-top-bar">
          <button className="primary coach-call-btn" onClick={onCall911}>
            📞 CALL 911
          </button>
          {dispatcherOpen && (
            <div role="status" className="coach-call-pill">
              SIMULATED · {formatClock(callSeconds)}
            </div>
          )}
        </div>

        {step.kind === 'diagram' && (
          <>
            <div className="coach-reticle" aria-hidden="true" />
            <span className="coach-reticle-label">{step.caption}</span>
          </>
        )}

        <div className="coach-bottom-panel">
          <button
            className="coach-voice-fab"
            aria-label={listening ? 'Voice input on (say "next" or "repeat")' : 'Voice input off, tap to enable'}
            aria-pressed={listening}
            onClick={toggleMic}
            style={{ opacity: status === 'unavailable' ? 0.4 : 1 }}
            disabled={status === 'unavailable'}
          >
            <MicIcon muted={!listening} />
          </button>
          {listening && (
            <span className="coach-voice-heard">{heard ? `Heard: "${heard}"` : 'Listening — say "next" or "repeat"'}</span>
          )}

          {step.kind === 'ring' && (
            <div className="coach-ring-wrap">
              <CompressionRing count={step.count} total={step.total} rateBpm={step.rateBpm} pace={step.pace} />
            </div>
          )}

          {step.branches && step.branches.length > 0 && (
            <div className="branch-row" style={{ justifyContent: 'center' }}>
              {step.branches.map((b) => (
                <button key={b.label} className="branch-btn" onClick={() => onBranch(b)}>
                  {b.label}
                </button>
              ))}
            </div>
          )}

          <div className="coach-caption">
            <div className="coach-caption-label">▂▄▆ MAYDAY SPEAKING</div>
            <p>{step.line}</p>
          </div>

          <button className="coach-next-btn" onClick={onNext}>
            {step.kind === 'diagram' ? step.nextLabel : 'NEXT'}
          </button>
        </div>
      </CameraView>
    </div>
  );
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" fill="#04110d" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="#04110d" strokeWidth="2" strokeLinecap="round" />
      {muted && <path d="M4 4L20 20" stroke="#04110d" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

function CompressionRing({ count, total, rateBpm, pace }: { count: number; total: number; rateBpm: number; pace: string }) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, count / total);
  const targetLow = 100;
  const targetHigh = 120;
  const rateMin = 80;
  const rateMax = 140;
  const ratePct = Math.max(0, Math.min(1, (rateBpm - rateMin) / (rateMax - rateMin)));

  return (
    <>
      <svg viewBox="0 0 160 160" width="140" height="140">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 80 80)"
        />
        <text x="80" y="76" textAnchor="middle" fontSize="32" fontWeight="800" fill="#fff">
          {count}
        </text>
        <text x="80" y="98" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.7)">
          of {total}
        </text>
      </svg>

      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, color: '#fff' }}>
          <span style={{ opacity: 0.7 }}>Rate</span>
          <span>
            <strong style={{ color: 'var(--ok)', fontSize: 15 }}>{rateBpm}</strong> BPM · {pace}
          </span>
        </div>
        <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.18)', borderRadius: 999 }}>
          <div
            style={{
              position: 'absolute',
              left: `${((targetLow - rateMin) / (rateMax - rateMin)) * 100}%`,
              width: `${((targetHigh - targetLow) / (rateMax - rateMin)) * 100}%`,
              top: 0,
              bottom: 0,
              background: 'rgba(47, 230, 192, 0.35)',
              borderRadius: 999,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: `calc(${ratePct * 100}% - 6px)`,
              top: -3,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: 'var(--ok)',
            }}
          />
        </div>
      </div>
    </>
  );
}
