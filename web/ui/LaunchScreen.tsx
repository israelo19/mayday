// LAUNCH screen, docs/05. Zero navigation: one button, the name, one line on what happens
// next. A judge walking up to the table reads it in three seconds.
//
// The screen carried the line about the call-taker being simulated until the owner took it
// out: the call panel had already lost its label so the call would read the way the real one
// will, and the launch screen reading the same caveat undid that on the way in. The app still
// never dials (boundaries.test.ts holds the tel: and auto-dial rules, and LiveApp only ever
// opens the scripted panel), and the disclaimer stands in README and NOTICE. Owned by P4.
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
    </div>
  );
}
