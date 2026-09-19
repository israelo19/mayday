// LAUNCH screen, docs/05. Zero navigation: one button, one line, nothing else. "or just start
// talking" becomes live once P3's voice/in.ts keyword listener exists; for now it's a label.
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
        gap: 24,
        padding: 24,
      }}
    >
      <button
        className="primary"
        onClick={onStart}
        style={{ width: '100%', maxWidth: 420, minHeight: 220, fontSize: 40, fontWeight: 800, borderRadius: 24 }}
      >
        I NEED HELP
      </button>
      <p style={{ color: 'var(--muted)', fontSize: 18, margin: 0 }}>or just start talking</p>
    </div>
  );
}
