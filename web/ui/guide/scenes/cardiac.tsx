// Cardiac (Hands-Only CPR) scenes, docs/02 `cardiac`. The compression loop is the one
// scene driven per frame: it reads the beat clock and the judgement so the figure pushes
// on the metronome tick and shows the engine's correction. Owned by P4.
import { useEffect, useRef } from 'react';
import { beatPhase, compressionDepth } from '../beat';
import type { SceneProps } from '../types';
import {
  ArrowDown,
  Bubble,
  CheckMark,
  ChestDent,
  ChestTop,
  Gaze,
  Ground,
  Hand,
  Label,
  PatientSide,
  RescuerSide,
  SIDE,
  Scene,
  TOP,
} from './primitives';

// =============================================================================
// Module Overview
// =============================================================================
// One component per docs/02 line: `SceneCheck`, `CheckBreathing`, `Kneel`, `HandHeel`,
// `HandStack`, `ArmsLocked`, `Compressions`, `RecoveryHold`. Static scenes animate with
// CSS; `Compressions` runs a requestAnimationFrame loop and writes SVG attributes directly
// so nothing re-renders at 60 fps.

/** Forward lean of the rescuer at full depth, in degrees about the hip. */
const LEAN_DEG = 9;

/** Depth gauge geometry: the chest marker travels from released (top) to two inches (bottom). */
const GAUGE = { x: 36, top: 112, bottom: 178 } as const;

/** "Tap his shoulders and shout: are you okay?" */
export function SceneCheck() {
  return (
    <Scene label="Tap the shoulders and shout">
      <Ground />
      <RescuerSide arms="reach" lean={4} />
      <PatientSide />
      <Bubble x={252} y={62}>
        Are you okay?
      </Bubble>
    </Scene>
  );
}

/** "Look at his chest. Is he breathing normally?" */
export function CheckBreathing() {
  return (
    <Scene label="Look at the chest for normal breathing">
      <Ground />
      <RescuerSide arms="rest" lean={6} />
      <PatientSide breathe />
      <Gaze x1={116} y1={60} x2={128} y2={160} />
      <g className="gd-anim-blink">
        <Label x={130} y={150} className="gd-label-big">
          ?
        </Label>
      </g>
      <path className="gd-chest-scan gd-anim-dash" d="M 84 166 Q 130 152 178 166" />
    </Scene>
  );
}

/** "Kneel beside his chest." */
export function Kneel() {
  return (
    <Scene label="Kneel beside the chest">
      <Ground />
      <RescuerSide arms="rest" />
      <PatientSide />
      <circle className="gd-cue-ring gd-anim-pulse" cx={SIDE.kneeX} cy={SIDE.kneeY} r={16} />
      <ArrowDown x={SIDE.headX} y={2} length={26} />
    </Scene>
  );
}

/** "Put the heel of one hand on the center of his chest, between the nipples." */
export function HandHeel() {
  return (
    <Scene label="Heel of one hand on the center of the chest">
      <ChestTop />
      <g className="gd-anim-land-right">
        <Hand x={TOP.targetX} y={TOP.targetY} rotate={-90} heel scale={1.15} />
      </g>
    </Scene>
  );
}

/** "Put your other hand on top. Lace your fingers." */
export function HandStack() {
  return (
    <Scene label="Other hand on top, fingers laced">
      <ChestTop target={false} />
      <Hand x={TOP.targetX} y={TOP.targetY} rotate={-90} scale={1.15} />
      <g className="gd-anim-land-left">
        <Hand x={TOP.targetX + 2} y={TOP.targetY - 10} rotate={-84} laced className="gd-hand-top" scale={1.15} />
      </g>
    </Scene>
  );
}

/** "Lock your elbows. Shoulders directly over your hands." */
export function ArmsLocked() {
  return (
    <Scene label="Elbows locked, shoulders over the hands">
      <Ground />
      <RescuerSide />
      <PatientSide />
      <line className="gd-guide-line" x1={SIDE.shoulderX} y1={36} x2={SIDE.shoulderX} y2={190} />
      <circle className="gd-cue-ring" cx={SIDE.shoulderX} cy={SIDE.shoulderY} r={9} />
      <circle className="gd-cue-ring gd-anim-pulse" cx={SIDE.shoulderX} cy={SIDE.elbowY} r={13} />
      <CheckMark x={62} y={92} className="gd-anim-fade" />
    </Scene>
  );
}

/** "Push hard and fast, at least two inches deep." / "Follow my beat." The loop. */
export function Compressions({ bpm, beatOriginMs, paused, judgement, emphasis }: SceneProps) {
  const upperRef = useRef<SVGGElement>(null);
  const dentRef = useRef<SVGEllipseElement>(null);
  const markerRef = useRef<SVGRectElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const goodRef = useRef<SVGCircleElement>(null);
  const releaseRef = useRef<SVGGElement>(null);

  const onBeat = judgement.active && judgement.rateBand === 'ok' && emphasis === null;
  const showRelease = emphasis === 'recoil';

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const phase = beatPhase(performance.now(), bpm, beatOriginMs);
      const depth = compressionDepth(phase);
      upperRef.current?.setAttribute('transform', `rotate(${(-LEAN_DEG * depth).toFixed(3)} ${SIDE.hipX} ${SIDE.hipY})`);
      dentRef.current?.setAttribute('ry', (1 + 7 * depth).toFixed(2));
      markerRef.current?.setAttribute('y', (GAUGE.top + (GAUGE.bottom - GAUGE.top) * depth - 3).toFixed(2));
      // The ring flashes on the tick and ripples out as it fades.
      const flash = Math.max(0, 1 - phase * 2.4);
      ringRef.current?.setAttribute('opacity', flash.toFixed(3));
      ringRef.current?.setAttribute('r', (26 + 16 * (1 - flash)).toFixed(2));
      goodRef.current?.setAttribute('opacity', (onBeat ? flash : 0).toFixed(3));
      // The release cue shows while the chest should be coming back up.
      releaseRef.current?.setAttribute('opacity', showRelease && phase > 0.2 && phase < 0.8 ? '1' : '0');
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [bpm, beatOriginMs, paused, onBeat, showRelease]);

  const ringClass = emphasis === 'stopped' ? 'gd-ring gd-ring-alarm' : emphasis === 'rate-low' || emphasis === 'rate-high' ? 'gd-ring gd-ring-cue' : 'gd-ring';

  return (
    <Scene label="Push hard and fast on the beat, at least two inches deep">
      <Ground />
      <RescuerSide upperRef={upperRef} />
      <PatientSide />
      <ChestDent depth={1} refEl={dentRef} />
      <circle ref={goodRef} className="gd-ring gd-ring-good" cx={SIDE.chestX} cy={SIDE.chestY} r={34} opacity={0} />
      <circle ref={ringRef} className={ringClass} cx={SIDE.chestX} cy={SIDE.chestY} r={26} opacity={0} />

      <g className="gd-gauge">
        <rect x={GAUGE.x - 5} y={GAUGE.top} width={10} height={GAUGE.bottom - GAUGE.top} rx={5} />
        <line x1={GAUGE.x - 14} y1={GAUGE.bottom} x2={GAUGE.x + 14} y2={GAUGE.bottom} />
        <rect ref={markerRef} className="gd-gauge-marker" x={GAUGE.x - 11} y={GAUGE.top - 3} width={22} height={6} rx={3} />
        <Label x={GAUGE.x} y={GAUGE.bottom + 20}>
          2 in
        </Label>
      </g>

      {(emphasis === 'rate-low' || emphasis === 'rate-high') && (
        <g className="gd-cue gd-anim-blink" transform={`translate(${SIDE.chestX + 62} 120)`}>
          {emphasis === 'rate-low' ? (
            <>
              <path d="M -12 -18 L 0 -6 L 12 -18" />
              <path d="M -12 0 L 0 12 L 12 0" />
              <path d="M -12 18 L 0 30 L 12 18" />
            </>
          ) : (
            <>
              <line x1={-14} y1={-4} x2={14} y2={-4} />
              <line x1={-14} y1={8} x2={14} y2={8} />
            </>
          )}
        </g>
      )}

      <g ref={releaseRef} className="gd-release" opacity={0}>
        <line x1={84} y1={SIDE.chestY} x2={178} y2={SIDE.chestY} />
        <path d={`M ${SIDE.chestX + 60} ${SIDE.chestY - 4} l 0 -30 m -10 10 l 10 -10 l 10 10`} />
        <Label x={SIDE.chestX + 60} y={SIDE.chestY - 42} className="gd-label-ok">
          all the way up
        </Label>
      </g>

      {emphasis === 'blind' && <BlindBadge />}
    </Scene>
  );
}

/** "Stay with him, keep watching his breathing, wait for EMS." */
export function RecoveryHold() {
  return (
    <Scene label="Stay, watch the breathing, wait for EMS">
      <Ground />
      <RescuerSide arms="rest" lean={6} />
      <PatientSide breathe />
      <Gaze x1={116} y1={60} x2={128} y2={160} />
      <g className="gd-clock" transform="translate(330 70)">
        <circle r={30} />
        {/* The invisible tail centers the group's box on the pivot, so a CSS rotate spins the hand about it. */}
        <g className="gd-anim-spin">
          <line x1={0} y1={0} x2={0} y2={-22} />
          <line x1={0} y1={0} x2={0} y2={22} opacity={0} />
        </g>
        <line x1={0} y1={0} x2={14} y2={8} />
      </g>
    </Scene>
  );
}

/** The camera has lost the view; the figure keeps the beat and the voice carries the line. */
function BlindBadge() {
  return (
    <g className="gd-blind" transform="translate(322 40)">
      <rect x={-70} y={-22} width={140} height={44} rx={10} />
      <path d="M -56 0 q 12 -14 24 0 q -12 14 -24 0 z" />
      <circle cx={-44} cy={0} r={4} />
      <line x1={-56} y1={-12} x2={-32} y2={12} />
      <text x={16} y={5} textAnchor="middle">
        voice only
      </text>
    </g>
  );
}
