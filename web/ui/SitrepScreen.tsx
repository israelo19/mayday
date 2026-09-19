// SITREP screen, docs/05. Read-aloud block for the dispatcher call plus the live timeline.
// `sitrep` will come from P2's buildSitrep() (docs/07 seam); App.tsx feeds mock data for now.
// The read-aloud button already talks to the real WebSpeechProvider (P3, exists since M0) --
// nothing fake about that part. Copy/download (borrowed pattern, see DECISIONS.md): a bystander
// handing the phone to a paramedic can hand over text instead of reading it live. Owned by P4.
import { useState } from 'react';
import type { SpeakerProvider } from '../../src/voice/out';

type Sitrep = {
  sayToDispatcher: { location: string; emergency: string; status: string };
  timeline: readonly { t: number; label: string }[];
};

type Props = {
  speaker: SpeakerProvider;
  sitrep: Sitrep;
  onNext: () => void;
};

export function SitrepScreen({ speaker, sitrep, onNext }: Props) {
  const { location, emergency, status } = sitrep.sayToDispatcher;
  const readAloudText = `Location: ${location}. Emergency: ${emergency}. Status: ${status}.`;
  const [copied, setCopied] = useState(false);

  function reportText(): string {
    const lines = [
      'MAYDAY SITREP',
      `Location: ${location}`,
      `Emergency: ${emergency}`,
      `Status: ${status}`,
      '',
      'Timeline:',
      ...sitrep.timeline.map((e) => `  ${formatTimestamp(e.t)} — ${e.label}`),
    ];
    return lines.join('\n');
  }

  function copyReport(): void {
    navigator.clipboard
      .writeText(reportText())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  function downloadReport(): void {
    const blob = new Blob([reportText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mayday-sitrep-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
      <h1 style={{ fontSize: 24, margin: 0 }}>SITREP</h1>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <p style={{ margin: '0 0 8px' }}>
          <strong>Location:</strong> {location}
        </p>
        <p style={{ margin: '0 0 8px' }}>
          <strong>Emergency:</strong> {emergency}
        </p>
        <p style={{ margin: '0 0 12px' }}>
          <strong>Status:</strong> {status}
        </p>
        <button onClick={() => void speaker.speak(readAloudText)}>Read aloud</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, color: 'var(--muted)', margin: '0 0 8px' }}>Timeline</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {sitrep.timeline.map((entry) => (
            <li key={entry.t}>
              {formatTimestamp(entry.t)} — {entry.label}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="branch-btn" style={{ flex: 1, minHeight: 48, textAlign: 'center' }} onClick={copyReport}>
          {copied ? '✓ Copied' : 'Copy report'}
        </button>
        <button className="branch-btn" style={{ flex: 1, minHeight: 48, textAlign: 'center' }} onClick={downloadReport}>
          Download
        </button>
      </div>

      <button className="primary" onClick={onNext} style={{ minHeight: 64, fontSize: 20 }}>
        HANDOFF
      </button>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
