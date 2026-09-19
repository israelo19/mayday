// Types for the step guides: the pictures that show a bystander what the current
// protocol state is asking for. Owned by P4 (web/ui, docs/07).
//
// A guide is keyed by `machine.state` from docs/02 and holds one step per canonical
// spoken line of that state. Captions are those lines verbatim. The guide never adds,
// reorders or rewords an instruction (CLAUDE.md principle 1); it only draws it.

// =============================================================================
// Module Overview
// =============================================================================
// Defines `Guide`, `GuideStep` and `SceneId`. `SCENE_IDS` is the list every scene
// registry must cover, and `GuideKey` ties a guide to a protocol state or to a
// keyword-triggered line such as the tourniquet advice in the bleeding machine.
import type { Emphasis, Judgement } from './judge';

/** Machines that ship with pictures. */
export type MachineId = 'cardiac' | 'bleeding' | 'choking';

/** `machine.state` from docs/02, or `machine.keyword` for a keyword-triggered line. */
export type GuideKey = `${MachineId}.${string}`;

/** Every drawable scene. The registry in `scenes/registry.ts` maps each one to a component. */
export const SCENE_IDS = [
  'scene_safety',
  'scene_check',
  'check_breathing',
  'call_911',
  'kneel',
  'hand_heel',
  'hand_stack',
  'arms_locked',
  'compressions',
  'recovery_hold',
  'handoff',
  'find_wound',
  'cloth_on_wound',
  'press_body_weight',
  'dont_lift',
  'pack_more',
  'pack_deep',
  'tourniquet',
  'choke_confirm',
  'encourage_cough',
  'back_blows',
  'abdominal_thrusts',
  'choke_resolved',
] as const;

export type SceneId = (typeof SCENE_IDS)[number];

export type GuideStep = {
  /** The docs/02 line this picture shows, verbatim. Never paraphrased here. */
  caption: string;
  scene: SceneId;
  /** How long the step stays up before the guide moves on; the last step wraps to the first. */
  holdMs: number;
};

export type Guide = {
  key: GuideKey;
  /** Short title for lists and the coach header. Not spoken, not an instruction. */
  title: string;
  steps: readonly GuideStep[];
  /** Present when the scene is a movement loop: the rate the figure follows, per minute. */
  beat?: { bpm: number };
  /** Where the reviewer verifies the lines: the docs/02 machine and its cited guideline. */
  source: string;
};

/** Inputs every scene receives. Static scenes ignore the beat and the judgement. */
export type SceneProps = {
  bpm: number;
  /** A `performance.now()` timestamp of one metronome tick, so the picture lands on the beat. */
  beatOriginMs: number;
  paused: boolean;
  /** How the bystander is doing, from the latest facts (see `judge.ts`). */
  judgement: Judgement;
  /** The engine's active correction, when it has a picture. */
  emphasis: Emphasis | null;
};
