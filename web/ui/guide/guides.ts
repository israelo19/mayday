// Step guide data: one guide per protocol state that has a picture. Owned by P4.
//
// Rules for this file (same spirit as docs/02):
// - Every caption is a docs/02 `say` line, verbatim. If docs/02 changes, this changes.
// - A guide holds one step per line, in the spoken order, so the picture and the voice
//   walk together when the coach screen advances the step as each line finishes.
// - No guide exists for a state without a spoken line (bleeding.handoff).
import type { Guide, GuideKey } from './types';

// =============================================================================
// Module Overview
// =============================================================================
// `GUIDES` is the typed data; `guideFor` and `guideKeys` are the only readers the rest
// of the app needs. `HOLD` names the reading times so a reviewer can tune them in one place.

/** Time a step stays on screen, chosen for reading a line at 1.5 m while it is spoken. */
const HOLD = {
  short: 5_000,
  line: 7_000,
  long: 9_000,
} as const;

/** AHA Hands-Only CPR: metronome rate from docs/02 `cardiac.compressions`. */
export const COMPRESSION_BPM = 110;

const cardiac: readonly Guide[] = [
  {
    key: 'cardiac.scene_check',
    title: 'Check response',
    source: 'docs/02 cardiac.scene_check (AHA Hands-Only CPR)',
    steps: [
      { caption: "Make sure it's safe to approach.", scene: 'scene_safety', holdMs: HOLD.short },
      { caption: 'Tap his shoulders and shout: are you okay?', scene: 'scene_check', holdMs: HOLD.line },
    ],
  },
  {
    key: 'cardiac.check_breathing',
    title: 'Check breathing',
    source: 'docs/02 cardiac.check_breathing (AHA Hands-Only CPR)',
    steps: [
      {
        caption: 'Look at his chest. Is he breathing normally? Gasping does not count as breathing.',
        scene: 'check_breathing',
        holdMs: HOLD.long,
      },
    ],
  },
  {
    key: 'cardiac.call_911',
    title: 'Call 911',
    source: 'docs/02 cardiac.call_911',
    steps: [
      {
        caption: 'Call 911 right now. Put the phone on speaker and lay it on the ground beside him.',
        scene: 'call_911',
        holdMs: HOLD.long,
      },
    ],
  },
  {
    key: 'cardiac.position',
    title: 'Hand position',
    source: 'docs/02 cardiac.position (AHA Hands-Only CPR)',
    steps: [
      { caption: 'Kneel beside his chest.', scene: 'kneel', holdMs: HOLD.short },
      {
        caption: 'Put the heel of one hand on the center of his chest, between the nipples.',
        scene: 'hand_heel',
        holdMs: HOLD.line,
      },
      { caption: 'Put your other hand on top. Lace your fingers.', scene: 'hand_stack', holdMs: HOLD.line },
      { caption: 'Lock your elbows. Shoulders directly over your hands.', scene: 'arms_locked', holdMs: HOLD.line },
    ],
  },
  {
    key: 'cardiac.compressions',
    title: 'Compressions',
    source: 'docs/02 cardiac.compressions (AHA Hands-Only CPR, 100-120 per minute)',
    beat: { bpm: COMPRESSION_BPM },
    steps: [
      { caption: 'Push hard and fast, at least two inches deep.', scene: 'compressions', holdMs: HOLD.line },
      { caption: 'Follow my beat. Do not stop.', scene: 'compressions', holdMs: HOLD.line },
    ],
  },
  {
    key: 'cardiac.recovery_hold',
    title: 'Breathing: stay with him',
    source: 'docs/02 cardiac.check_breathing, the "yes breathing" branch',
    steps: [
      { caption: 'Stay with him, keep watching his breathing, wait for EMS.', scene: 'recovery_hold', holdMs: HOLD.long },
    ],
  },
  {
    key: 'cardiac.handoff',
    title: 'Handoff',
    source: 'docs/02 cardiac.handoff',
    steps: [
      { caption: "Tell the paramedics: I'll show you the timeline on my screen.", scene: 'handoff', holdMs: HOLD.long },
    ],
  },
];

const bleeding: readonly Guide[] = [
  {
    key: 'bleeding.scene_safety',
    title: 'Are you safe?',
    source: 'docs/02 bleeding.scene_safety (Stop the Bleed)',
    steps: [
      {
        caption:
          'First: are YOU safe? If the danger is still there, do not approach. Move to safety and tell me when it\'s safe.',
        scene: 'scene_safety',
        holdMs: HOLD.long,
      },
    ],
  },
  {
    key: 'bleeding.call_911',
    title: 'Call 911',
    source: 'docs/02 bleeding.call_911',
    steps: [{ caption: 'Call 911 now. Speaker on, phone on the ground.', scene: 'call_911', holdMs: HOLD.line }],
  },
  {
    key: 'bleeding.find_wound',
    title: 'Find the wound',
    source: 'docs/02 bleeding.find_wound (Stop the Bleed)',
    steps: [
      {
        caption: 'Find where the blood is coming from. Open or cut clothing so you can see the wound.',
        scene: 'find_wound',
        holdMs: HOLD.long,
      },
    ],
  },
  {
    key: 'bleeding.pressure',
    title: 'Pressure',
    source: 'docs/02 bleeding.pressure (Stop the Bleed)',
    steps: [
      {
        caption: 'Take cloth if you have it. Press it hard onto the wound with both hands.',
        scene: 'cloth_on_wound',
        holdMs: HOLD.line,
      },
      {
        caption: 'Push down with your full body weight. It should be hard enough to hurt.',
        scene: 'press_body_weight',
        holdMs: HOLD.line,
      },
      { caption: 'Do not lift your hands to look. Do not stop.', scene: 'dont_lift', holdMs: HOLD.line },
    ],
  },
  {
    key: 'bleeding.pack',
    title: 'Pack the wound',
    source: 'docs/02 bleeding.pack (Stop the Bleed)',
    steps: [
      {
        caption: 'Do not remove the soaked cloth. Add more cloth on top and keep pressing.',
        scene: 'pack_more',
        holdMs: HOLD.line,
      },
      {
        caption: 'If the wound is deep, push the cloth INTO the wound and keep pressure on it.',
        scene: 'pack_deep',
        holdMs: HOLD.line,
      },
    ],
  },
  {
    // Not a state: docs/02 speaks this only when the bystander says 'tourniquet'.
    key: 'bleeding.tourniquet',
    title: 'Tourniquet (only if asked)',
    source: 'docs/02 bleeding, tourniquet note (Stop the Bleed)',
    steps: [
      {
        caption:
          'If you have a real tourniquet kit, place it two to three inches above the wound, not on a joint, and tighten until the bleeding stops. Otherwise keep pressing.',
        scene: 'tourniquet',
        holdMs: HOLD.long,
      },
    ],
  },
];

const choking: readonly Guide[] = [
  {
    key: 'choking.confirm',
    title: 'Can he cough?',
    source: 'docs/02 choking.confirm (Red Cross adult choking)',
    steps: [
      { caption: 'Can he cough or speak? If he can cough, let him cough.', scene: 'choke_confirm', holdMs: HOLD.line },
      { caption: "If he cannot make a sound, tell me: he can't breathe.", scene: 'choke_confirm', holdMs: HOLD.line },
    ],
  },
  {
    key: 'choking.call_911',
    title: 'Call 911',
    source: 'docs/02 choking.call_911',
    steps: [
      {
        caption: 'Call 911 now. Put the phone on speaker and set it down where you can hear me.',
        scene: 'call_911',
        holdMs: HOLD.long,
      },
    ],
  },
  {
    key: 'choking.encourage_cough',
    title: 'Let him cough',
    source: 'docs/02 choking.encourage_cough (Red Cross adult choking)',
    steps: [
      { caption: 'Good. Keep him coughing. Do not hit his back while he can cough.', scene: 'encourage_cough', holdMs: HOLD.line },
      { caption: 'Stay with him. If he stops making sound, tell me.', scene: 'encourage_cough', holdMs: HOLD.line },
    ],
  },
  {
    key: 'choking.back_blows',
    title: 'Back blows',
    source: 'docs/02 choking.back_blows (Red Cross adult choking)',
    steps: [
      { caption: 'Stand behind him and lean him forward.', scene: 'back_blows', holdMs: HOLD.short },
      { caption: 'Hit him five times between the shoulder blades with the heel of your hand.', scene: 'back_blows', holdMs: HOLD.long },
    ],
  },
  {
    key: 'choking.abdominal_thrusts',
    title: 'Abdominal thrusts',
    source: 'docs/02 choking.abdominal_thrusts (Red Cross adult choking)',
    steps: [
      { caption: 'Stand behind him. Make a fist just above his belly button.', scene: 'abdominal_thrusts', holdMs: HOLD.line },
      { caption: 'Grab your fist with your other hand. Pull hard, inward and upward, five times.', scene: 'abdominal_thrusts', holdMs: HOLD.long },
      { caption: 'If it does not come out, we go back to back blows.', scene: 'back_blows', holdMs: HOLD.line },
    ],
  },
  {
    key: 'choking.resolved',
    title: 'It came out',
    source: 'docs/02 choking.resolved (Red Cross adult choking)',
    steps: [
      { caption: 'Good. Stay with him until the ambulance arrives. Keep watching his breathing.', scene: 'choke_resolved', holdMs: HOLD.long },
    ],
  },
  {
    key: 'choking.handoff',
    title: 'Handoff',
    source: 'docs/02 choking.handoff',
    steps: [
      { caption: 'Tell the paramedics what happened and how long it took. It is on my screen.', scene: 'handoff', holdMs: HOLD.long },
    ],
  },
];

/** All guides, in the order the machines walk them. */
export const GUIDES: readonly Guide[] = [...cardiac, ...bleeding, ...choking];

const byKey: ReadonlyMap<string, Guide> = new Map(GUIDES.map((g) => [g.key, g]));

/** The guide for `machine.state`, or null when that state has no picture (the screen shows text only). */
export function guideFor(key: string): Guide | null {
  return byKey.get(key) ?? null;
}

/** Every key with a picture, for the gallery and the tests. */
export function guideKeys(): readonly GuideKey[] {
  return GUIDES.map((g) => g.key);
}
