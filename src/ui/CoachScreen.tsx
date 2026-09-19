// COACH screen, design proposal (see DECISIONS.md) implementing docs/05's spec: giant
// instruction, live metric, camera thumbnail with P1's pose overlay, CALL 911 persistent top,
// NEXT persistent bottom (manual-advance fallback so any voice transition has a button twin).
// The dispatcher indicator is ALWAYS labeled SIMULATED, including once "connected" -- CLAUDE.md
// principle 5 / docs/05 require the sim to never read as a real 911 line at any point, which is
// the one thing the pasted design mockup got wrong on its equivalent screen.
// `step` will come from session.ts/P2's engine (CoachingEvent) once it exists; App.tsx feeds
// mock data (src/ui/mockDemoData.ts) for now. Owned by P4.
import { CameraView } from './CameraView';
import type { Perception } from '../perception';
import type { MockCoachStep } from './mockDemoData';

type Props = {
  perception: Perception;
  step: MockCoachStep;
  dispatcherOpen: boolean;
  callSeconds: number;
  onCall911: () => void;
  onNext: () => void;
};

export function CoachScreen({ perception, step, dispatcherOpen, callSeconds, onCall911, onNext }: Props) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="primary" onClick={onCall911} style={{ fontSize: 18, flex: 1 }}>
          📞 CALL 911
        </button>
        <div style={{ width: 100 }}>
          <CameraView perception={perception} mirror={false} />
        </div>
      </div>

      {dispatcherOpen && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'var(--panel)',
            border: `1px solid var(--ok)`,
            color: 'var(--ok)',
            fontWeight: 700,
            fontSize: 13,
            padding: '8px 12px',
            borderRadius: 999,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />
          SIMULATED CALL CONNECTED · {formatClock(callSeconds)}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {step.kind === 'diagram' ? <HandPlacementDiagram caption={step.caption} /> : <CompressionRing count={step.count} total={step.total} rateBpm={step.rateBpm} pace={step.pace} />}
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ok)', fontSize: 12, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>
          ▂▄▆ MAYDAY SPEAKING
        </div>
        <p style={{ margin: 0, fontSize: 'clamp(18px, 4.5vw, 24px)', fontWeight: 600, lineHeight: 1.35 }}>{step.line}</p>
      </div>

      <button onClick={onNext} style={{ minHeight: 60, fontSize: 18, fontWeight: 700 }}>
        {step.kind === 'diagram' ? step.nextLabel : 'NEXT'}
      </button>
    </div>
  );
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function HandPlacementDiagram({ caption }: { caption: string }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
      <svg viewBox="0 0 280 200" width="100%" role="img" aria-label="Patient lying down with a hand-placement marker over the chest">
        <ellipse cx="140" cy="120" rx="70" ry="34" fill="var(--panel)" stroke="var(--border)" />
        <circle cx="60" cy="120" r="20" fill="var(--panel)" stroke="var(--border)" />
        <line x1="150" y1="95" x2="200" y2="70" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <line x1="150" y1="145" x2="200" y2="170" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <line x1="200" y1="105" x2="240" y2="80" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <line x1="200" y1="135" x2="240" y2="160" stroke="var(--border)" strokeWidth="8" strokeLinecap="round" />
        <circle cx="140" cy="90" r="10" fill="var(--ok)" opacity="0.25" />
        <circle cx="140" cy="90" r="5" fill="var(--ok)" />
      </svg>
      <span
        style={{
          position: 'absolute',
          top: 30,
          left: '58%',
          background: 'var(--panel)',
          border: '1px solid var(--ok)',
          color: 'var(--ok)',
          fontSize: 12,
          fontWeight: 700,
          padding: '4px 10px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
        }}
      >
        {caption}
      </span>
    </div>
  );
}

function CompressionRing({ count, total, rateBpm, pace }: { count: number; total: number; rateBpm: number; pace: string }) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, count / total);
  const targetLow = 100;
  const targetHigh = 120;
  const rateMin = 80;
  const rateMax = 140;
  const ratePct = Math.max(0, Math.min(1, (rateBpm - rateMin) / (rateMax - rateMin)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', maxWidth: 300 }}>
      <svg viewBox="0 0 200 200" width="200" height="200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--border)" strokeWidth="14" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="var(--ok)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 100 100)"
        />
        <text x="100" y="94" textAnchor="middle" fontSize="40" fontWeight="800" fill="var(--fg)">
          {count}
        </text>
        <text x="100" y="118" textAnchor="middle" fontSize="12" fill="var(--muted)">
          of {total} compressions
        </text>
      </svg>

      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: 'var(--muted)' }}>Compression rate</span>
          <span>
            <strong style={{ color: 'var(--ok)', fontSize: 16 }}>{rateBpm}</strong> BPM · {pace}
          </span>
        </div>
        <div style={{ position: 'relative', height: 6, background: 'var(--border)', borderRadius: 999 }}>
          <div
            style={{
              position: 'absolute',
              left: `${((targetLow - rateMin) / (rateMax - rateMin)) * 100}%`,
              width: `${((targetHigh - targetLow) / (rateMax - rateMin)) * 100}%`,
              top: 0,
              bottom: 0,
              background: 'rgba(47, 230, 192, 0.25)',
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          <span>{rateMin}</span>
          <span>
            Target {targetLow}–{targetHigh}
          </span>
          <span>{rateMax}</span>
        </div>
      </div>
    </div>
  );
}
