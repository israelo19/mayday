// Bleeding path stub, design proposal (see DECISIONS.md). The bleeding protocol (docs/02,
// docs/06 M3) isn't built -- this says so honestly instead of routing into the CPR mock
// content, which would misrepresent guidance that doesn't exist yet. Owned by P4.
type Props = { onCall911: () => void; onBack: () => void };

export function BleedingStub({ onCall911, onBack }: Props) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, padding: 24 }}>
      <span className="eyebrow">— Severe bleeding —</span>
      <h1 style={{ fontSize: 'clamp(26px, 7vw, 34px)', margin: 0 }}>Bleeding guidance isn't built yet.</h1>
      <p style={{ color: 'var(--muted)', fontSize: 15, margin: 0 }}>
        This demo currently covers cardiac arrest coaching only. Apply firm, direct pressure to the wound with a
        cloth and call 911 now.
      </p>
      <button className="primary" onClick={onCall911} style={{ minHeight: 64, fontSize: 18 }}>
        📞 CALL 911
      </button>
      <button onClick={onBack} style={{ minHeight: 52, fontSize: 15 }}>
        ← Back
      </button>
    </div>
  );
}
