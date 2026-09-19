// Choking (conscious adult) scenes, docs/02 `choking`. Standing figures: the patient in
// slate, the rescuer behind in warm white, cues in the warning yellow. One component per
// docs/02 line, static, CSS animated. Owned by P4.
import { ArrowSide, Bubble, CheckMark, CrossMark, Gaze, Ground, Hand, Label, Scene, Standing } from './primitives';

// =============================================================================
// Module Overview
// =============================================================================
// `ChokeConfirm`, `EncourageCough`, `BackBlows`, `AbdominalThrusts`, `ChokeResolved`.

const G = 207; // ground line, same as common.tsx

/** Both hands at the throat: the universal sign, drawn on the patient. */
function Throat({ x, y }: { x: number; y: number }) {
  return (
    <g className="gd-hands">
      <circle cx={x - 13} cy={y} r={8} />
      <circle cx={x + 13} cy={y} r={8} />
    </g>
  );
}

/** "Can he cough or speak? If he can cough, let him cough." */
export function ChokeConfirm() {
  return (
    <Scene label="Ask whether he can cough or speak">
      <Ground />
      <Standing x={258} y={G} className="gd-them" />
      <Throat x={258} y={G - 138} />
      <Standing x={118} y={G} className="gd-you" />
      <Bubble x={118} y={40}>Can you cough?</Bubble>
      <Gaze x1={134} y1={G - 156} x2={240} y2={G - 138} />
    </Scene>
  );
}

/** "Good. Keep him coughing. Do not hit his back while he can cough." */
export function EncourageCough() {
  return (
    <Scene label="Let him cough; do not hit his back">
      <Ground />
      <Standing x={250} y={G} className="gd-them" bent={22} />
      <g className="gd-waves gd-anim-wave" transform={`translate(${312} ${G - 150})`}>
        <path d="M 0 -10 q 8 10 0 20" />
        <path d="M 12 -16 q 12 16 0 32" />
        <path d="M 24 -22 q 16 22 0 44" />
      </g>
      <CheckMark x={318} y={40} />
      <Standing x={150} y={G} className="gd-you" />
      <Hand x={200} y={G - 128} rotate={-20} heel />
      <CrossMark x={214} y={G - 150} size={12} />
    </Scene>
  );
}

/** "Hit him five times between the shoulder blades with the heel of your hand." */
export function BackBlows() {
  return (
    <Scene label="Lean him forward and strike between the shoulder blades five times">
      <Ground />
      <Standing x={258} y={G} className="gd-them" bent={34} />
      <Standing x={148} y={G} className="gd-you" bent={8} />
      <line className="gd-you" x1={156} y1={G - 128} x2={226} y2={G - 118} strokeWidth={11} strokeLinecap="round" />
      <g className="gd-anim-nudge-right">
        <Hand x={236} y={G - 116} rotate={90} heel />
      </g>
      <ArrowSide x={196} y={G - 150} dir="right" length={34} />
      <Label x={330} y={60} className="gd-label-big">
        5
      </Label>
      <Label x={330} y={82} className="gd-label-muted">
        times
      </Label>
    </Scene>
  );
}

/** "Make a fist just above his belly button. Pull hard, inward and upward, five times." */
export function AbdominalThrusts() {
  return (
    <Scene label="From behind, fist above the navel, pull inward and upward five times">
      <Ground />
      <Standing x={240} y={G} className="gd-them" bent={10} />
      <Standing x={186} y={G} className="gd-you" bent={6} />
      <line className="gd-you" x1={194} y1={G - 126} x2={252} y2={G - 100} strokeWidth={11} strokeLinecap="round" />
      <line className="gd-you" x1={180} y1={G - 118} x2={250} y2={G - 96} strokeWidth={11} strokeLinecap="round" />
      <circle className="gd-hands" cx={254} cy={G - 96} r={11} />
      <g transform={`translate(${290} ${G - 74})`}>
        <g className="gd-cue gd-anim-nudge-left">
          <line x1={0} y1={0} x2={-30} y2={-30} />
          <path d="M -30 -14 L -30 -30 L -14 -30" />
        </g>
      </g>
      <Label x={330} y={60} className="gd-label-big">
        5
      </Label>
      <Label x={330} y={82} className="gd-label-muted">
        times
      </Label>
    </Scene>
  );
}

/** "Good. Stay with him until the ambulance arrives. Keep watching his breathing." */
export function ChokeResolved() {
  return (
    <Scene label="It is out; stay with him and keep watching his breathing">
      <Ground />
      <Standing x={236} y={G} className="gd-them gd-anim-breathe" />
      <CheckMark x={236} y={30} />
      <Standing x={120} y={G} className="gd-you" />
      <Gaze x1={136} y1={G - 156} x2={222} y2={G - 120} />
      <Standing x={340} y={G} className="gd-ems" />
      <g className="gd-ems-cross" transform="translate(340 112)">
        <rect x={-3.5} y={-12} width={7} height={24} />
        <rect x={-12} y={-3.5} width={24} height={7} />
      </g>
    </Scene>
  );
}
