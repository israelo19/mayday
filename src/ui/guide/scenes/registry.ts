// The one place a SceneId becomes a component. The `Record<SceneId, ...>` type makes
// the compiler refuse a scene that is missing or misspelled. Owned by P4.
import type { ComponentType } from 'react';
import type { SceneId, SceneProps } from '../types';
import { ClothOnWound, DontLift, FindWound, PackDeep, PackMore, PressBodyWeight, Tourniquet } from './bleeding';
import { ArmsLocked, CheckBreathing, Compressions, HandHeel, HandStack, Kneel, RecoveryHold, SceneCheck } from './cardiac';
import { Call911, Handoff, SceneSafety } from './common';

// =============================================================================
// Module Overview
// =============================================================================
// `SCENES` maps every `SceneId` to its component; `sceneFor` is the reader the player uses.

export const SCENES: Record<SceneId, ComponentType<SceneProps>> = {
  scene_safety: SceneSafety,
  scene_check: SceneCheck,
  check_breathing: CheckBreathing,
  call_911: Call911,
  kneel: Kneel,
  hand_heel: HandHeel,
  hand_stack: HandStack,
  arms_locked: ArmsLocked,
  compressions: Compressions,
  recovery_hold: RecoveryHold,
  handoff: Handoff,
  find_wound: FindWound,
  cloth_on_wound: ClothOnWound,
  press_body_weight: PressBodyWeight,
  dont_lift: DontLift,
  pack_more: PackMore,
  pack_deep: PackDeep,
  tourniquet: Tourniquet,
};

/** The component that draws `id`. */
export function sceneFor(id: SceneId): ComponentType<SceneProps> {
  return SCENES[id];
}
