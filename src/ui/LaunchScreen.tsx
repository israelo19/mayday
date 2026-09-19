// LAUNCH screen, design proposal (see DECISIONS.md) replacing docs/05's single-button version
// with a 911-gate + talk-to-me pattern. "or just start talking" / the mic card are still labels
// only until P3's voice/in.ts keyword listener exists. Owned by P4.

type Props = {
  onNeedHelp: () => void;
  onNotYet: () => void;
};

export function LaunchScreen({ onNeedHelp, onNotYet }: Props) {
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 20px',
        gap: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
        <span style={{ fontWeight: 800, letterSpacing: 2, fontSize: 13 }}>MAYDAY</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 'clamp(32px, 8vw, 44px)', lineHeight: 1.15, margin: 0 }}>
          Do you need me to call 911?
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 16, margin: 0 }}>
          We'll get you to the call screen and prep everything the dispatcher needs to hear.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="primary" onClick={onNeedHelp} style={{ minHeight: 60, fontSize: 18 }}>
          Yes — I need help
        </button>
        <button onClick={onNotYet} style={{ minHeight: 52, fontSize: 16 }}>
          Not yet
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0', color: 'var(--muted)', fontSize: 12, letterSpacing: 1 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          OR JUST TALK TO ME
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <button
          onClick={onNeedHelp}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            minHeight: 68,
            background: 'var(--panel)',
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(47, 230, 192, 0.15)',
              color: 'var(--ok)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            🎙
          </span>
          <span>
            <div style={{ fontWeight: 700 }}>Tap and tell me what's happening</div>
            <div style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 14 }}>"He's not breathing..."</div>
          </span>
        </button>

        <p style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', margin: 0 }}>
          For life-threatening emergencies. If you're ever unsure, call 911.
        </p>
      </div>
    </div>
  );
}
