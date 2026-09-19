// Scenes shared by more than one machine: scene safety, calling 911, the handoff.
// Owned by P4.
import { ArrowDown, ArrowSide, Gaze, Ground, PatientSide, Phone, Scene, Standing } from './primitives';

// =============================================================================
// Module Overview
// =============================================================================
// `SceneSafety`, `Call911` and `Handoff` each draw one docs/02 line that appears in
// both the cardiac and the bleeding machine. They take `SceneProps` for uniformity and
// ignore the beat.

/** "Make sure it's safe" / "are YOU safe?": a hazard to look at before approaching. */
export function SceneSafety() {
  return (
    <Scene label="Look for danger before you approach">
      <Ground />
      <Standing x={110} y={SIDE_GROUND} className="gd-you" />
      <Gaze x1={126} y1={48} x2={262} y2={112} />
      <g className="gd-hazard gd-anim-blink" transform="translate(300 118)">
        <path d="M 0 -46 L 44 32 L -44 32 Z" />
        <line x1={0} y1={-18} x2={0} y2={8} />
        <circle cx={0} cy={20} r={3.5} />
      </g>
      <ArrowSide x={72} y={150} dir="left" />
    </Scene>
  );
}

const SIDE_GROUND = 207;

/** "Call 911 ... speaker on, phone on the ground": the phone laid beside the patient. */
export function Call911() {
  return (
    <Scene label="Call 911, speaker on, phone on the ground beside the patient">
      <Ground />
      <PatientSide />
      <Phone x={262} y={196} />
      <ArrowDown x={262} y={118} length={40} />
    </Scene>
  );
}

/** "I'll show you the timeline on my screen": the report handed to the paramedic. */
export function Handoff() {
  const rows = [0, 1, 2, 3, 4];
  return (
    <Scene label="Show the paramedics the timeline on the screen">
      <Ground />
      <g transform="translate(120 120)">
        <rect className="gd-phone" x={-46} y={-84} width={92} height={168} rx={12} />
        <rect className="gd-phone-screen" x={-40} y={-76} width={80} height={152} rx={8} />
        {rows.map((i) => (
          <g key={i} className="gd-anim-rise" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
            <circle className="gd-row-dot" cx={-28} cy={-56 + i * 28} r={4} />
            <rect className="gd-row-line" x={-18} y={-59 + i * 28} width={48 - (i % 3) * 8} height={6} rx={3} />
          </g>
        ))}
      </g>
      <ArrowSide x={196} y={120} dir="right" length={60} />
      <Standing x={312} y={SIDE_GROUND} className="gd-ems" />
      <g className="gd-ems-cross" transform="translate(312 112)">
        <rect x={-3.5} y={-12} width={7} height={24} />
        <rect x={-12} y={-3.5} width={24} height={7} />
      </g>
    </Scene>
  );
}
