// LAUNCH screen, docs/05. Zero navigation: one button, the name, one line on what happens
// next. A judge walking up to the table reads it in three seconds. This screen is also the
// ONE place the app admits the dispatcher is scripted (CLAUDE.md principle 5). It used to be
// stamped on the call panel itself, which made the thing we are building towards look like a
// toy at the exact moment it should look like the product. Disclose once, before anyone is in
// an emergency, then let the call read the way the real one will. Owned by P4.
import './launch.css';

type Props = { onStart: () => void };

export function LaunchScreen({ onStart }: Props) {
  return (
    <div className="launch">
      <div className="launch-head">
        <span className="launch-name">MAYDAY</span>
        <span className="launch-tagline">Point the camera at the patient. I watch, and coach you until the ambulance arrives.</span>
      </div>
      <button className="primary launch-cta" onClick={onStart}>
        I NEED HELP
      </button>
      {/* Nothing is listening yet, and on iOS nothing can be: SpeechRecognition.start() is only
          granted inside a tap. So this line no longer invites speech, it warns what the tap does,
          which is the prompt people were meeting with no warning at all. */}
      <p className="launch-note">Camera and microphone turn on when you tap.</p>
      {/* The disclosure that boundaries.test.ts enforces. Quiet, but before the tap, not after. */}
      <p className="launch-fine">
        Demo build. The 911 call-taker in this app is a simulated dispatcher and is not a real emergency line. In a real
        emergency, dial 911 on your phone.
      </p>
    </div>
  );
}
