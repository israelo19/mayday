// TRIAGE screen, design proposal (see DECISIONS.md). Added because the mock flow was jumping
// straight into CPR coaching with no assessment step at all -- CLAUDE.md principle 1 keeps
// "which protocol applies" out of any inference path (no diagnosis from the camera, ever;
// scope wall: no blood detection via CV), so that decision has to come from the bystander's
// own words or tap, same as it would from a real triage state machine (docs/02) once P2's
// engine exists. This screen is the stand-in for that decision point.
// Voice is real, not decorative: P3's `voice.listen()` (src/voice, docs/07) does actual
// SpeechRecognition keyword spotting with echo suppression already wired in. Every voice
// transition still has a button twin (docs/05 "judge-proof").
import { useEffect, useState } from 'react';
import type { Voice, VoiceInStatus } from '../../src/voice';

type Props = {
  voice: Voice;
  onCardiac: () => void;
  onBleeding: () => void;
};

const KEYWORDS = ['not breathing', 'unresponsive', 'no pulse', 'not responding', 'bleeding', 'blood'] as const;
const BLEEDING_KEYWORDS = new Set(['bleeding', 'blood']);

export function TriageScreen({ voice, onCardiac, onBleeding }: Props) {
  const [status, setStatus] = useState<VoiceInStatus | 'idle'>('idle');
  const [heard, setHeard] = useState<string | null>(null);

  useEffect(() => {
    voice.listen({
      keywords: () => KEYWORDS,
      onKeyword: (k) => (BLEEDING_KEYWORDS.has(k) ? onBleeding() : onCardiac()),
      onTranscript: (t) => setHeard(t),
      onStatus: setStatus,
    });
    return () => voice.stopListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listening = status === 'listening' || status === 'restarting';

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
      }}
    >
      <span className="eyebrow">— What's happening —</span>
      <h1 style={{ fontSize: 'clamp(26px, 7vw, 36px)', margin: 0 }}>Tell me, or tap the one that fits.</h1>
      <p style={{ color: 'var(--muted)', margin: 0, fontSize: 15 }}>I'll walk you through it either way.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <button className="option-card" onClick={onCardiac}>
          <div className="option-title">Not breathing / unresponsive</div>
          <div className="option-desc">Collapsed, no response, not breathing normally</div>
          <div className="option-tags">
            <span className="tag">AHA 2020</span>
            <span className="tag">Adult</span>
            <span className="tag">Hands-Only CPR</span>
          </div>
        </button>
        <button className="option-card" onClick={onBleeding}>
          <div className="option-title">Severe bleeding</div>
          <div className="option-desc">Heavy bleeding from a wound, possibly life-threatening</div>
          <div className="option-tags">
            <span className="tag">Stop the Bleed</span>
            <span className="tag">Tourniquet Guide</span>
          </div>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, color: 'var(--muted)', fontSize: 13 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: listening ? 'var(--ok)' : status === 'unavailable' ? 'var(--border)' : 'var(--warn)',
            boxShadow: listening ? '0 0 0 4px rgba(47,230,192,0.2)' : 'none',
            transition: 'box-shadow 200ms',
          }}
        />
        {status === 'unavailable' && 'Voice input not available in this browser -- use the buttons above.'}
        {status === 'idle' && 'Starting microphone...'}
        {listening && (heard ? `Heard: "${heard}"` : 'Listening -- say what\'s happening')}
        {status === 'stopped' && 'Microphone off'}
      </div>
    </div>
  );
}
