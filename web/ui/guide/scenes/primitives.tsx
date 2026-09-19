// Shared SVG parts for the step guide scenes: pictogram bodies, hands, a phone, cloth,
// a wound. Every scene composes these in a 400 x 240 viewBox so they can be swapped
// without relayout. Colors come from CSS variables in guide.css. Owned by P4.
import type { ReactNode } from 'react';

// =============================================================================
// Module Overview
// =============================================================================
// `Scene` is the frame. `PatientSide`, `RescuerSide` and `SIDE` draw the side view used
// for CPR; `ChestTop`, `Hand`, `TOP` draw the view from above used for hand placement
// and bleeding control. `Phone`, `Cloth`, `Wound`, `Limb` and the cue marks are props
// scenes place where they need them.

export const VIEW = { w: 400, h: 240 } as const;

/** Anchor points of the side view: the patient's chest and the kneeling rescuer's joints. */
export const SIDE = {
  groundY: 207,
  chestX: 130,
  chestY: 171,
  hipX: 192,
  hipY: 152,
  shoulderX: 130,
  shoulderY: 70,
  elbowY: 118,
  handY: 166,
  headX: 113,
  headY: 48,
  kneeX: 214,
  kneeY: 184,
} as const;

/** Anchor points of the view from above: the compression point sits between the nipples. */
export const TOP = { targetX: 200, targetY: 116, nippleY: 108 } as const;

// =============================================================================
// Frame
// =============================================================================

/** The scene frame: a fixed viewBox that scales to its container and keeps its aspect. */
export function Scene({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg className="gd-svg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {children}
    </svg>
  );
}

export function Ground() {
  return <line className="gd-ground" x1={12} y1={SIDE.groundY} x2={VIEW.w - 12} y2={SIDE.groundY} />;
}

// =============================================================================
// Side view: patient on the ground, rescuer kneeling behind
// =============================================================================

/** The patient lying on the back, head to the left. `breathe` adds a slow chest rise. */
export function PatientSide({ breathe = false }: { breathe?: boolean }) {
  return (
    <g className="gd-them">
      <circle cx={52} cy={187} r={17} />
      <g className={breathe ? 'gd-anim-breathe' : undefined}>
        <line x1={80} y1={188} x2={182} y2={188} strokeWidth={34} />
      </g>
      {/* Legs sit a little lower and thinner than the torso so the rescuer's shin behind them stays visible. */}
      <line x1={182} y1={195} x2={332} y2={197} strokeWidth={18} />
      <line x1={332} y1={197} x2={352} y2={188} strokeWidth={11} />
    </g>
  );
}

/** Depression in the chest under the hands; `depth` 0..1 grows it. Drawn in the background color. */
export function ChestDent({ depth, refEl }: { depth: number; refEl?: React.Ref<SVGEllipseElement> }) {
  return <ellipse ref={refEl} className="gd-dent" cx={SIDE.chestX} cy={SIDE.chestY} rx={24} ry={1 + 7 * depth} />;
}

type RescuerSideProps = {
  /** Degrees of forward lean about the hip; the compression loop drives this per frame. */
  lean?: number;
  /** Ref to the upper-body group so a loop can rotate it without React. */
  upperRef?: React.Ref<SVGGElement>;
  /** Draw the arms straight down to the chest (CPR) or resting on the thigh (kneeling only). */
  arms?: 'chest' | 'rest' | 'reach';
  children?: ReactNode;
};

/** The rescuer kneeling behind the patient, upper body pivoting at the hip. */
export function RescuerSide({ lean = 0, upperRef, arms = 'chest', children }: RescuerSideProps) {
  return (
    <g className="gd-you">
      {/* The knee rests on a ground line behind the patient, higher in the frame as a slightly raised viewpoint would show it. */}
      <line x1={SIDE.hipX} y1={SIDE.hipY} x2={SIDE.kneeX} y2={SIDE.kneeY} strokeWidth={20} />
      <line x1={SIDE.kneeX} y1={SIDE.kneeY} x2={278} y2={SIDE.kneeY} strokeWidth={16} />
      <g ref={upperRef} transform={`rotate(${-lean} ${SIDE.hipX} ${SIDE.hipY})`}>
        <line x1={SIDE.hipX} y1={SIDE.hipY} x2={SIDE.shoulderX} y2={SIDE.shoulderY} strokeWidth={22} />
        <circle cx={SIDE.headX} cy={SIDE.headY} r={15} />
        {arms === 'chest' && (
          <>
            <line className="gd-you-far" x1={SIDE.shoulderX + 7} y1={SIDE.shoulderY + 4} x2={SIDE.shoulderX + 7} y2={SIDE.handY - 2} strokeWidth={12} />
            <line x1={SIDE.shoulderX} y1={SIDE.shoulderY} x2={SIDE.shoulderX} y2={SIDE.handY} strokeWidth={12} />
            <rect className="gd-hands" x={SIDE.chestX - 13} y={SIDE.handY - 3} width={26} height={10} rx={4} />
          </>
        )}
        {arms === 'rest' && (
          <>
            <line x1={SIDE.shoulderX} y1={SIDE.shoulderY} x2={118} y2={152} strokeWidth={12} />
            <rect className="gd-hands" x={106} y={150} width={24} height={10} rx={4} />
          </>
        )}
        {arms === 'reach' && (
          <>
            <line x1={SIDE.shoulderX} y1={SIDE.shoulderY} x2={150} y2={150} strokeWidth={12} />
            <g className="gd-anim-tap">
              <line x1={150} y1={150} x2={92} y2={170} strokeWidth={12} />
              <rect className="gd-hands" x={78} y={164} width={22} height={10} rx={4} />
            </g>
          </>
        )}
        {children}
      </g>
    </g>
  );
}

// =============================================================================
// View from above: chest, hands, limb
// =============================================================================

/** The chest seen from above, shoulders at the top, with the nipple line and the breastbone. */
export function ChestTop({ target = true }: { target?: boolean }) {
  return (
    <g>
      <rect className="gd-them-fill" x={184} y={-10} width={32} height={48} rx={12} />
      <path className="gd-them-fill" d="M 176 34 L 96 44 Q 76 46 74 66 L 90 248 L 310 248 L 326 66 Q 324 46 304 44 L 224 34 Z" />
      <g className="gd-them">
        <circle cx={150} cy={TOP.nippleY} r={5} />
        <circle cx={250} cy={TOP.nippleY} r={5} />
        <line x1={200} y1={50} x2={200} y2={178} strokeWidth={3} strokeDasharray="5 9" opacity={0.6} />
      </g>
      {target && (
        <g className="gd-target">
          <circle className="gd-anim-pulse" cx={TOP.targetX} cy={TOP.targetY} r={22} fill="none" strokeWidth={4} />
          <circle cx={TOP.targetX} cy={TOP.targetY} r={6} />
        </g>
      )}
    </g>
  );
}

type HandProps = {
  x: number;
  y: number;
  /** Rotation in degrees; 0 points the fingers up the page, -90 points them left. */
  rotate?: number;
  /** Mark the heel of the hand (the part that goes on the chest). */
  heel?: boolean;
  /** Draw finger-lacing marks for the hand on top. */
  laced?: boolean;
  className?: string;
  scale?: number;
};

/** A palm-down hand pictogram with the heel at (`x`, `y`). */
export function Hand({ x, y, rotate = 0, heel = false, laced = false, className, scale = 1 }: HandProps) {
  return (
    <g className={`gd-hand ${className ?? ''}`} transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <rect x={-21} y={-76} width={9.5} height={36} rx={4.5} />
      <rect x={-10} y={-81} width={9.5} height={41} rx={4.5} />
      <rect x={1} y={-78} width={9.5} height={38} rx={4.5} />
      <rect x={12} y={-70} width={9} height={30} rx={4.5} />
      <rect x={24} y={-50} width={11} height={36} rx={5.5} transform="rotate(-38 26 -14)" />
      <rect x={-22} y={-48} width={44} height={48} rx={12} />
      {laced && (
        <g className="gd-lace">
          <line x1={-17} y1={-66} x2={-9} y2={-58} />
          <line x1={-6} y1={-70} x2={2} y2={-62} />
          <line x1={5} y1={-67} x2={13} y2={-59} />
        </g>
      )}
      {heel && <ellipse className="gd-heel" cx={0} cy={-9} rx={15} ry={6} />}
    </g>
  );
}

/** A limb seen from above (a thigh), running across the scene; the body is to the left. */
export function Limb({ clothed = false }: { clothed?: boolean }) {
  return (
    <g>
      <rect className="gd-them-fill" x={-30} y={70} width={110} height={120} rx={30} />
      <rect className="gd-them-fill" x={20} y={82} width={370} height={92} rx={46} />
      {clothed && <rect className="gd-cloth-dark" x={60} y={82} width={330} height={92} rx={46} />}
    </g>
  );
}

// =============================================================================
// Props: phone, cloth, wound, marks
// =============================================================================

/** A phone lying flat with 911 on the screen and the speaker playing. */
export function Phone({ x, y, waves = true }: { x: number; y: number; waves?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="gd-phone" x={-46} y={-25} width={92} height={50} rx={9} />
      <rect className="gd-phone-screen" x={-40} y={-20} width={80} height={40} rx={6} />
      <text className="gd-phone-text" x={-12} y={7} textAnchor="middle">
        911
      </text>
      <path className="gd-speaker" d="M 14 -6 h 5 l 7 -6 v 24 l -7 -6 h -5 z" />
      {waves && (
        <g className="gd-waves">
          <path className="gd-anim-wave" d="M 29 -6 q 5 6 0 12" />
          <path className="gd-anim-wave" style={{ animationDelay: '0.35s' }} d="M 34 -11 q 9 11 0 22" />
        </g>
      )}
    </g>
  );
}

/** A folded cloth; `soaked` draws it dark red. `className` animates an inner group, so it can move. */
export function Cloth({ x, y, rotate = 0, soaked = false, className }: { x: number; y: number; rotate?: number; soaked?: boolean; className?: string }) {
  return (
    <g className={className}>
      <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
        <rect className={soaked ? 'gd-cloth-soaked' : 'gd-cloth'} x={-36} y={-27} width={72} height={54} rx={9} />
        <path className="gd-cloth-fold" d="M -30 -6 q 30 -14 60 0" />
      </g>
    </g>
  );
}

/** A wound; `bleeding` pulses a red ring around it. */
export function Wound({ x, y, bleeding = true, r = 14 }: { x: number; y: number; bleeding?: boolean; r?: number }) {
  return (
    <g className="gd-wound">
      {bleeding && <circle className="gd-anim-bleed" cx={x} cy={y} r={r + 8} />}
      <circle cx={x} cy={y} r={r} />
      <circle className="gd-wound-core" cx={x} cy={y} r={r * 0.45} />
    </g>
  );
}

/** A red cross mark meaning "not this". */
export function CrossMark({ x, y, size = 16, className }: { x: number; y: number; size?: number; className?: string }) {
  return (
    <g className={`gd-cross ${className ?? ''}`} transform={`translate(${x} ${y})`}>
      <circle r={size + 8} />
      <line x1={-size} y1={-size} x2={size} y2={size} />
      <line x1={size} y1={-size} x2={-size} y2={size} />
    </g>
  );
}

/** A green check mark meaning "like this". */
export function CheckMark({ x, y, size = 16, className }: { x: number; y: number; size?: number; className?: string }) {
  return (
    <g className={`gd-check ${className ?? ''}`} transform={`translate(${x} ${y})`}>
      <circle r={size + 8} />
      <path d={`M ${-size * 0.8} ${size * 0.05} L ${-size * 0.2} ${size * 0.7} L ${size * 0.9} ${-size * 0.7}`} />
    </g>
  );
}

/** A down arrow cue; animates a slow push. The moving group sits inside the placed one. */
export function ArrowDown({ x, y, length = 40, className }: { x: number; y: number; length?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`gd-cue gd-anim-nudge ${className ?? ''}`}>
        <line x1={0} y1={0} x2={0} y2={length} />
        <path d={`M -12 ${length - 12} L 0 ${length} L 12 ${length - 12}`} />
      </g>
    </g>
  );
}

/** A sideways arrow cue pointing left or right of (`x`, `y`). */
export function ArrowSide({ x, y, dir, length = 40 }: { x: number; y: number; dir: 'left' | 'right'; length?: number }) {
  const sign = dir === 'left' ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={`gd-cue ${dir === 'left' ? 'gd-anim-nudge-left' : 'gd-anim-nudge-right'}`}>
        <line x1={0} y1={0} x2={sign * length} y2={0} />
        <path d={`M ${sign * (length - 12)} -12 L ${sign * length} 0 L ${sign * (length - 12)} 12`} />
      </g>
    </g>
  );
}

/** A short caption drawn inside the picture, for numbers the line already says (2 in, 2-3 in). */
export function Label({ x, y, children, anchor = 'middle', className }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; className?: string }) {
  return (
    <text className={`gd-label ${className ?? ''}`} x={x} y={y} textAnchor={anchor}>
      {children}
    </text>
  );
}

/** A speech bubble with one short line in it. */
export function Bubble({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <g className="gd-bubble gd-anim-fade" transform={`translate(${x} ${y})`}>
      <path d="M -68 -22 h 136 a 8 8 0 0 1 8 8 v 26 a 8 8 0 0 1 -8 8 h -104 l -14 12 v -12 h -18 a 8 8 0 0 1 -8 -8 v -26 a 8 8 0 0 1 8 -8 z" />
      <text x={0} y={5} textAnchor="middle">
        {children}
      </text>
    </g>
  );
}

/** A dashed line of sight from the eye to what the line says to look at. */
export function Gaze({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line className="gd-gaze gd-anim-dash" x1={x1} y1={y1} x2={x2} y2={y2} />;
}

/** A standing person pictogram, feet at (`x`, `y`). */
export function Standing({ x, y, className, bent = 0 }: { x: number; y: number; className: string; bent?: number }) {
  return (
    <g className={className} transform={`translate(${x} ${y})`}>
      <line x1={-8} y1={0} x2={-4} y2={-70} strokeWidth={14} />
      <line x1={8} y1={0} x2={4} y2={-70} strokeWidth={14} />
      <g transform={`rotate(${bent} 0 -70)`}>
        <line x1={0} y1={-70} x2={0} y2={-140} strokeWidth={22} />
        <line x1={-4} y1={-128} x2={-20} y2={-72} strokeWidth={11} />
        <line x1={4} y1={-128} x2={20} y2={-72} strokeWidth={11} />
        <circle cx={0} cy={-160} r={15} />
      </g>
    </g>
  );
}
