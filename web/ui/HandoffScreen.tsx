// HANDOFF screen, docs/05. The closing shot of the demo: headline metrics, timeline, QR of the
// report JSON. `handoff` will come from P2's buildHandoff() (docs/07 seam); App.tsx feeds mock
// data for now. The QR itself is P2's job (`qrcode` package, docs/07 P2 task 6) once
// HandoffReport.toJSON() exists -- this renders a placeholder box until then rather than
// reaching for a QR library under a task P4 doesn't own. Owned by P4.

type Handoff = {
  cprStartedAt: string;
  avgRateBpm: number;
  pauses: number;
  longestPauseSec: number;
  pressureTimeSec: number | null;
  timeline: readonly { t: number; label: string }[];
};

type Props = { handoff: Handoff };

export function HandoffScreen({ handoff }: Props) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
      <h1 style={{ fontSize: 24, margin: 0 }}>HANDOFF</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Metric label="CPR started" value={handoff.cprStartedAt} />
        <Metric label="Avg rate" value={`${handoff.avgRateBpm} bpm`} />
        <Metric label="Pauses" value={String(handoff.pauses)} />
        <Metric label="Longest pause" value={`${handoff.longestPauseSec}s`} />
        {handoff.pressureTimeSec != null && <Metric label="Pressure time" value={`${handoff.pressureTimeSec}s`} />}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 16, color: 'var(--muted)', margin: '0 0 8px' }}>Timeline</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {handoff.timeline.map((entry) => (
            <li key={entry.t}>{entry.label}</li>
          ))}
        </ul>
      </div>

      <div
        style={{
          alignSelf: 'center',
          width: 160,
          height: 160,
          border: '2px dashed var(--border)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          textAlign: 'center',
          fontSize: 12,
          padding: 8,
        }}
      >
        QR pending P2's HandoffReport.toJSON() (docs/07)
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
