// COACH screen, docs/05. What the phone shows propped on the ground: giant instruction, live
// metric, small camera thumbnail with P1's pose overlay, CALL 911 persistent top, NEXT
// persistent bottom (manual-advance fallback so any voice transition has a button twin).
// `line`/`metricLabel`/`metricValue` are session.ts's job once it exists (P2's engine via
// CoachingEvent); App.tsx feeds mock data for now. Owned by P4.
import { CameraView } from './CameraView';
import type { Perception } from '../../src/perception';

type Props = {
  perception: Perception;
  line: string;
  metricLabel: string;
  metricValue: string;
  dispatcherOpen: boolean;
  onCall911: () => void;
  onNext: () => void;
};

export function CoachScreen({ perception, line, metricLabel, metricValue, dispatcherOpen, onCall911, onNext }: Props) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
      <button className="primary" onClick={onCall911} style={{ fontSize: 20 }}>
        CALL 911
      </button>

      {dispatcherOpen && (
        <div
          role="status"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 800,
            textAlign: 'center',
            padding: 10,
            borderRadius: 8,
          }}
        >
          SIMULATED DISPATCHER
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 120 }}>
          <CameraView perception={perception} mirror={false} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <p style={{ fontSize: 'clamp(28px, 6vw, 48px)', fontWeight: 700, margin: 0 }}>{line}</p>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14, letterSpacing: 1 }}>{metricLabel}</div>
        <div style={{ fontSize: 40, fontWeight: 800 }}>{metricValue}</div>
      </div>

      <button onClick={onNext} style={{ minHeight: 64, fontSize: 20, fontWeight: 700 }}>
        NEXT
      </button>
    </div>
  );
}
