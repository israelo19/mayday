// CALL PREP screen, design proposal (see DECISIONS.md): merges SITREP prep into the pre-call
// screen so a bystander sees what to say before the dispatcher even picks up. The
// "DEMO / SIMULATED DISPATCHER" label is deliberately never dropped, including once "connected"
// (CLAUDE.md principle 5 / docs/05: the simulated call must always read as simulated, never as a
// real 911 line). `sitrep` will come from P2's buildSitrep() (docs/07 seam); mock data for now.
// Owned by P4.

type Sitrep = {
  location: string;
  situation: string;
  actionsTaken: string;
};

type Props = {
  sitrep: Sitrep;
  onCall911: () => void;
  onStartGuidance: () => void;
  onBack: () => void;
};

export function CallPrepScreen({ sitrep, onCall911, onStartGuidance, onBack }: Props) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', padding: '20px', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} aria-label="Back" style={{ minHeight: 40, padding: '8px 14px' }}>
          ←
        </button>
        <span
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '6px 14px',
            fontSize: 12,
            letterSpacing: 1,
            color: 'var(--muted)',
            fontWeight: 700,
          }}
        >
          DEMO · SIMULATED DISPATCHER
        </span>
      </div>

      <button
        className="primary"
        onClick={onCall911}
        style={{ minHeight: 68, fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        📞 CALL 911
      </button>
      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Tap to dial. We've prepped what to say below.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
        <span style={{ color: 'var(--ok)', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>SITREP</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>read this aloud when they pick up</span>
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        <SitrepRow icon="📍" label="LOCATION · via GPS" text={sitrep.location} />
        <Divider />
        <SitrepRow icon="⚠️" label="SITUATION" text={sitrep.situation} />
        <Divider />
        <SitrepRow icon="✅" label="ACTIONS TAKEN" text={sitrep.actionsTaken} />
      </div>

      <button
        onClick={onStartGuidance}
        style={{
          minHeight: 60,
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--ok)',
          background: 'transparent',
          border: '1px solid var(--ok)',
        }}
      >
        Start guidance now →
      </button>
      <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, margin: 0 }}>
        Don't wait for the call to connect — coaching can start immediately.
      </p>
    </div>
  );
}

function SitrepRow({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ fontSize: 16, lineHeight: '1.4' }}>{icon}</span>
      <div>
        <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 15 }}>{text}</div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)' }} />;
}
