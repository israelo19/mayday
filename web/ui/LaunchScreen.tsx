// LAUNCH screen, docs/05. Zero navigation: one button, the name, one line on what happens
// next. A judge walking up to the table reads it in three seconds. The SIMULATED label lives
// on the dispatcher panel itself (docs/05, CLAUDE.md principle 5), where the fake call
// actually happens, not pre-announced here. Owned by P4.

type Props = { onStart: () => void };

export function LaunchScreen({ onStart }: Props) {
  return (
    <div
      style={{
        // 100dvh is the FULL visual viewport, but index.css already pads body by the safe-area
        // insets and #root is 100% of that padded content box. Asking for 100dvh here subtracted
        // the inset once and added it back once, so the card overflowed by the notch, body became
        // a scroll container (overflow-x: hidden forces overflow-y: auto), and a thumb that
        // drifted on the big button was read as a pan, cancelling the tap. 100% fits the box.
        height: '100%',
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
      {/* Nothing is listening yet, and on iOS nothing can be: SpeechRecognition.start() is only
          granted inside a tap. So this line no longer invites speech, it warns what the tap does,
          which is the prompt people were meeting with no warning at all. */}
      <p style={{ color: 'var(--muted)', fontSize: 18, margin: 0 }}>Camera and microphone turn on when you tap.</p>
    </div>
  );
}
