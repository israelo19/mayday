// COACH screen, docs/05. What the phone shows propped on the ground: giant instruction, live
// metric, small camera thumbnail with P1's pose overlay, CALL 911 persistent top, NEXT
// persistent bottom (manual-advance fallback so any voice transition has a button twin).
// `line`/`metricLabel`/`metricValue` are session.ts's job once it exists (P2's engine via
// CoachingEvent); App.tsx feeds mock data for now. The SIMULATED dispatcher panel shows the
// call-taker's lines and, with the agent live, what it heard the bystander say. Owned by P4.
import { CameraView } from './CameraView';
import type { Perception } from '../../src/perception';

export type DispatcherLine = { who: 'dispatcher' | 'you'; text: string };

/** 'scripted' is the offline stub; the rest are the ElevenLabs agent's states (docs/04 item 3). */
export type DispatcherPanelStatus = 'scripted' | 'connecting' | 'live' | 'fallback' | 'ended';

export type DispatcherPanel = {
  open: boolean;
  status: DispatcherPanelStatus;
  lines: readonly DispatcherLine[];
  /** Button twin for a spoken reply: advances the scripted call-taker to its next question. */
  onReply: () => void;
  onHangup: () => void;
};

type Props = {
  perception: Perception;
  line: string;
  metricLabel: string;
  metricValue: string;
  dispatcher: DispatcherPanel;
  onCall911: () => void;
  onNext: () => void;
};

const STATUS_LABEL: Record<DispatcherPanelStatus, string> = {
  scripted: 'Scripted',
  connecting: 'Connecting',
  live: 'Listening',
  fallback: 'Scripted (agent unavailable)',
  ended: 'Call ended',
};

export function CoachScreen({ perception, line, metricLabel, metricValue, dispatcher, onCall911, onNext }: Props) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
      <button className="primary" onClick={onCall911} disabled={dispatcher.open} style={{ fontSize: 20 }}>
        CALL 911
      </button>

      {dispatcher.open && <DispatcherPanelView panel={dispatcher} />}

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

function DispatcherPanelView({ panel }: { panel: DispatcherPanel }) {
  // The agent hears the mic itself; a Reply button only makes sense for the scripted call.
  const showReply = panel.status === 'scripted' || panel.status === 'fallback';
  const recent = panel.lines.slice(-3);
  return (
    <div
      role="status"
      style={{ background: 'var(--panel)', border: '2px solid var(--accent)', borderRadius: 8, overflow: 'hidden' }}
    >
      <div
        style={{
          background: 'var(--accent)',
          color: '#fff',
          fontWeight: 800,
          padding: '8px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>SIMULATED DISPATCHER</span>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{STATUS_LABEL[panel.status]}</span>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15 }}>
        {recent.length === 0 && <span style={{ color: 'var(--muted)' }}>Connecting to the simulated call-taker...</span>}
        {recent.map((l, i) => (
          <div key={`${i}-${l.text}`} style={{ color: l.who === 'you' ? 'var(--muted)' : 'inherit' }}>
            <strong>{l.who === 'you' ? 'You: ' : 'Dispatcher: '}</strong>
            {l.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 10px 10px' }}>
        {showReply && (
          <button onClick={panel.onReply} style={{ flex: 1, minHeight: 44 }}>
            I answered
          </button>
        )}
        <button onClick={panel.onHangup} style={{ flex: 1, minHeight: 44 }}>
          Hang up
        </button>
      </div>
    </div>
  );
}
