// LAUNCH screen, docs/05. Zero navigation: one button, the name, one line on what happens
// next, and the demo label. A judge walking up to the table reads it in three seconds.
// Owned by P4.

type Props = { onStart: () => void };

export function LaunchScreen({ onStart }: Props) {
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.18em', color: 'var(--accent)' }}>MAYDAY</span>
        <span style={{ fontSize: 17, color: 'var(--muted)', lineHeight: 1.35 }}>Point the camera at the patient. I watch, and coach you until the ambulance arrives.</span>
      </div>
      <button
        className="primary"
        onClick={onStart}
        style={{ width: '100%', maxWidth: 420, minHeight: 220, fontSize: 40, fontWeight: 800, borderRadius: 24 }}
      >
        I NEED HELP
      </button>
      <p style={{ color: 'var(--muted)', fontSize: 18, margin: 0 }}>or just start talking</p>
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0, maxWidth: 420, lineHeight: 1.4 }}>
        Uses the camera and microphone on this phone. Demo build: the 911 call is simulated and never dials.
      </p>
    </div>
  );
}
