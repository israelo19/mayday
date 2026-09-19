// Bleeding control scenes, docs/02 `bleeding` (Stop the Bleed). All CSS-animated; the
// hands-on-wound judgement only changes the marks around the pressing hands. Owned by P4.
import type { SceneProps } from '../types';
import { ArrowDown, CheckMark, Cloth, CrossMark, Hand, Label, Limb, Scene, Wound } from './primitives';

// =============================================================================
// Module Overview
// =============================================================================
// `FindWound`, `ClothOnWound`, `PressBodyWeight`, `DontLift`, `PackMore`, `PackDeep`
// and `Tourniquet`, one per docs/02 line. The wound sits at `WOUND` on a thigh seen from
// above with the body to the left, so "above the wound" reads as "toward the body".

const WOUND = { x: 240, y: 128 } as const;

/** "Find where the blood is coming from. Open or cut clothing so you can see the wound." */
export function FindWound() {
  return (
    <Scene label="Open the clothing to find the wound">
      <Limb />
      <Wound x={WOUND.x} y={WOUND.y} />
      <g className="gd-anim-open-left">
        <rect className="gd-cloth-dark" x={40} y={82} width={196} height={92} rx={40} />
        <Hand x={214} y={150} rotate={24} scale={0.8} />
      </g>
      <g className="gd-anim-open-right">
        <rect className="gd-cloth-dark" x={244} y={82} width={160} height={92} rx={40} />
        <Hand x={268} y={104} rotate={204} scale={0.8} />
      </g>
      <g className="gd-scissors" transform="translate(348 36)">
        <circle cx={-10} cy={10} r={7} />
        <circle cx={10} cy={10} r={7} />
        <line x1={-6} y1={4} x2={14} y2={-22} />
        <line x1={6} y1={4} x2={-14} y2={-22} />
      </g>
    </Scene>
  );
}

/** "Take cloth if you have it. Press it hard onto the wound with both hands." */
export function ClothOnWound() {
  return (
    <Scene label="Cloth on the wound, both hands pressing">
      <Limb />
      <Wound x={WOUND.x} y={WOUND.y} />
      <Cloth x={WOUND.x} y={WOUND.y} rotate={-8} className="gd-anim-drop" />
      <g className="gd-anim-land-right" style={{ animationDelay: '0.7s' }}>
        <StackedHands x={WOUND.x} y={WOUND.y} />
      </g>
    </Scene>
  );
}

/** "Push down with your full body weight. It should be hard enough to hurt." */
export function PressBodyWeight({ judgement }: SceneProps) {
  return (
    <Scene label="Press with your full body weight">
      <Limb />
      <Cloth x={WOUND.x} y={WOUND.y} rotate={-8} />
      <g className="gd-anim-press">
        <StackedHands x={WOUND.x} y={WOUND.y} />
      </g>
      <ArrowDown x={WOUND.x} y={4} length={40} className="gd-cue-heavy" />
      {judgement.handsOn === true && <CheckMark x={332} y={44} className="gd-anim-fade" />}
    </Scene>
  );
}

/** "Do not lift your hands to look. Do not stop." */
export function DontLift({ judgement, emphasis }: SceneProps) {
  const off = emphasis === 'hands-off' || judgement.handsOn === false;
  return (
    <Scene label="Keep the hands on the wound, do not lift to look">
      <Limb />
      <Cloth x={WOUND.x} y={WOUND.y} rotate={-8} />
      <g className="gd-anim-press">
        <StackedHands x={WOUND.x} y={WOUND.y} />
      </g>
      <g className={`gd-ghost ${off ? 'gd-ghost-hot' : 'gd-anim-lift'}`}>
        <Hand x={WOUND.x - 4} y={WOUND.y - 30} rotate={-90} className="gd-hand-ghost" />
        <CrossMark x={WOUND.x + 46} y={WOUND.y - 70} size={14} />
      </g>
      {!off && <CheckMark x={332} y={44} className="gd-anim-fade" />}
    </Scene>
  );
}

/** "Do not remove the soaked cloth. Add more cloth on top and keep pressing." */
export function PackMore() {
  return (
    <Scene label="Leave the soaked cloth, add more on top">
      <Limb />
      <Cloth x={WOUND.x} y={WOUND.y} rotate={-8} soaked />
      <CheckMark x={WOUND.x - 62} y={WOUND.y + 46} size={12} />
      <Cloth x={WOUND.x + 4} y={WOUND.y - 8} rotate={6} className="gd-anim-drop" />
      <g className="gd-anim-land-right" style={{ animationDelay: '0.8s' }}>
        <StackedHands x={WOUND.x + 4} y={WOUND.y - 6} />
      </g>
    </Scene>
  );
}

/** "If the wound is deep, push the cloth INTO the wound and keep pressure on it." */
export function PackDeep() {
  return (
    <Scene label="Push the cloth into a deep wound">
      <path
        className="gd-them-fill"
        d="M 20 120 H 168 Q 176 120 179 130 L 190 186 Q 200 198 210 186 L 221 130 Q 224 120 232 120 H 380 V 226 H 20 Z"
      />
      <g className="gd-anim-stuff">
        <path className="gd-cloth-fill" d="M 182 110 q 8 -12 18 0 q 8 -12 18 0 v 24 q -10 12 -18 0 q -10 12 -18 0 z" />
        <path className="gd-cloth-fill" d="M 184 134 q 8 -10 16 0 q 8 -10 16 0 v 22 q -8 12 -16 0 q -8 12 -16 0 z" />
        <path className="gd-cloth-fill" d="M 188 158 q 6 -8 12 0 q 6 -8 12 0 v 18 q -6 10 -12 0 q -6 10 -12 0 z" />
      </g>
      <g className="gd-anim-push">
        <Hand x={200} y={62} rotate={180} scale={0.9} />
      </g>
      <ArrowDown x={262} y={40} length={36} />
      <line className="gd-guide-line" x1={20} y1={120} x2={380} y2={120} />
    </Scene>
  );
}

/** Tourniquet line, spoken only when asked: two to three inches above the wound, not on a joint. */
export function Tourniquet() {
  const band = { x: 176, w: 22 } as const;
  return (
    <Scene label="Tourniquet two to three inches above the wound, not on a joint">
      <Limb />
      <g className="gd-anim-bleed-cycle">
        <Wound x={WOUND.x + 22} y={WOUND.y} />
      </g>
      <circle className="gd-joint" cx={344} cy={WOUND.y} r={30} />
      <CrossMark x={344} y={54} size={12} />
      <g className="gd-anim-drop-cycle">
        <rect className="gd-band" x={band.x} y={74} width={band.w} height={108} rx={7} />
        <g className="gd-windlass" transform={`translate(${band.x + band.w / 2} 62)`}>
          <line className="gd-anim-twist-cycle" x1={-26} y1={0} x2={26} y2={0} />
        </g>
      </g>
      <g className="gd-dimension">
        <line x1={band.x + band.w} y1={206} x2={WOUND.x + 22} y2={206} />
        <line x1={band.x + band.w} y1={198} x2={band.x + band.w} y2={214} />
        <line x1={WOUND.x + 22} y1={198} x2={WOUND.x + 22} y2={214} />
        <Label x={(band.x + band.w + WOUND.x + 22) / 2} y={230}>
          2-3 in
        </Label>
      </g>
      <Label x={20} y={60} anchor="start" className="gd-label-muted">
        body
      </Label>
    </Scene>
  );
}

/** Two hands stacked palm-down on one spot. */
function StackedHands({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Hand x={x} y={y} rotate={-90} />
      <Hand x={x + 2} y={y - 9} rotate={-84} laced className="gd-hand-top" />
    </g>
  );
}
