// MACHINE: cardiac (Hands-Only CPR, adult). Pure data, docs/02.
//
// Hands-Only CPR is what the AHA tells untrained lay rescuers to do: compressions only, no
// rescue breaths. That is deliberate and we say so if asked. Every line below is transcribed
// from the cited page; if a line and the guideline ever disagree, the guideline wins and this
// file changes. A human verifies each line against the live page before the demo.
import { BLIND_CONFIDENCE, type Machine } from '../../types';
import { BLIND_RULE } from './shared';

const AHA_HANDS_ONLY = 'https://cpr.heart.org/en/cpr-courses-and-kits/hands-only-cpr';
const AHA_ADULT_CPR = 'https://cpr.heart.org/en/resources/what-is-cpr';
// 2025 AHA Guidelines Part 7, where the rate and depth numbers this state coaches come from:
// 100 to 120 compressions a minute, at least 2 inches deep, no deeper than 2.4.
const AHA_ADULT_BLS = 'https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/adult-basic-life-support';

export const cardiac: Machine = {
  id: 'cardiac',
  source: AHA_HANDS_ONLY,
  medical: true,
  initial: 'scene_check',
  states: [
    {
      id: 'scene_check',
      source: AHA_ADULT_CPR,
      say: ["Make sure it's safe to approach.", 'Tap his shoulders and shout: are you okay?'],
      transitions: [
        { on: { kind: 'keyword', keyword: 'no response' }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'keyword', keyword: 'not responding' }, to: 'check_breathing', label: 'Not responding' },
        { on: { kind: 'keyword', keyword: 'unresponsive' }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'keyword', keyword: 'nothing' }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'keyword', keyword: 'no answer' }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'keyword', keyword: 'not moving' }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'keyword', keyword: "won't wake up" }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'keyword', keyword: 'passed out' }, to: 'check_breathing', label: 'No response' },
        { on: { kind: 'manualAdvance' }, to: 'check_breathing', label: 'Next' },
      ],
    },
    {
      id: 'check_breathing',
      source: AHA_ADULT_CPR,
      say: ['Look at his chest. Is he breathing normally? Gasping does not count as breathing.'],
      transitions: [
        { on: { kind: 'keyword', keyword: 'not breathing' }, to: 'call_911', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: 'gasping' }, to: 'call_911', label: 'Only gasping' },
        { on: { kind: 'keyword', keyword: 'no pulse' }, to: 'call_911', label: 'No pulse' },
        { on: { kind: 'keyword', keyword: 'no' }, to: 'call_911', label: 'No' },
        { on: { kind: 'keyword', keyword: "isn't breathing" }, to: 'call_911', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: 'stopped breathing' }, to: 'call_911', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: 'no breathing' }, to: 'call_911', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: 'barely breathing' }, to: 'call_911', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: 'not breathing normally' }, to: 'call_911', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: "he's breathing" }, to: 'recovery_hold', label: 'He is breathing' },
        { on: { kind: 'keyword', keyword: "she's breathing" }, to: 'recovery_hold', label: 'She is breathing' },
        { on: { kind: 'keyword', keyword: 'yes' }, to: 'recovery_hold', label: 'Yes, breathing' },
        { on: { kind: 'keyword', keyword: "they're breathing" }, to: 'recovery_hold', label: 'Yes, breathing' },
        { on: { kind: 'keyword', keyword: 'breathing normally' }, to: 'recovery_hold', label: 'Yes, breathing' },
        { on: { kind: 'keyword', keyword: 'breathing fine' }, to: 'recovery_hold', label: 'Yes, breathing' },
        { on: { kind: 'manualAdvance' }, to: 'call_911', label: 'Next' },
      ],
    },
    {
      id: 'call_911',
      source: AHA_HANDS_ONLY,
      call911: true,
      requiredWords: ['911'],
      say: ['Call 911 right now. Put the phone on speaker and lay it on the ground beside him.'],
      transitions: [
        { on: { kind: 'timerMs', ms: 8000 }, to: 'position', label: 'Called' },
        { on: { kind: 'manualAdvance' }, to: 'position', label: 'Next' },
      ],
    },
    {
      id: 'position',
      source: AHA_HANDS_ONLY,
      requiredWords: ['hand', 'chest'],
      say: [
        'Kneel beside his chest.',
        'Put the heel of one hand on the center of his chest, between the nipples.',
        'Put your other hand on top. Lace your fingers.',
        'Lock your elbows. Shoulders directly over your hands.',
      ],
      transitions: [
        {
          on: { kind: 'fact', predicate: (f) => f.compressionActive },
          to: 'compressions',
          label: 'Started compressions',
        },
        { on: { kind: 'manualAdvance' }, to: 'compressions', label: 'Next' },
      ],
    },
    {
      id: 'compressions',
      source: AHA_ADULT_BLS,
      metronome: 110,
      requiredWords: ['push'],
      say: ['Push hard and fast, at least two inches deep.', 'Follow my beat. Do not stop.'],
      coachingRules: [
        {
          id: 'rate-low',
          priority: 'critical',
          requires: ['compressionRate'],
          when: (f) => f.compressionActive && f.compressionRate !== null && f.compressionRate < 100,
          say: 'Faster. Push with the beat.',
        },
        {
          id: 'rate-high',
          priority: 'correction',
          requires: ['compressionRate'],
          when: (f) => f.compressionRate !== null && f.compressionRate > 125,
          say: 'A little slower. Match the beat.',
        },
        {
          id: 'recoil',
          priority: 'correction',
          requires: ['recoilRatio'],
          when: (f) => f.recoilRatio !== null && f.recoilRatio < 0.6,
          say: 'Let the chest come all the way back up between pushes.',
        },
        {
          id: 'stopped',
          priority: 'critical',
          forMs: 3000,
          when: (f) => !f.compressionActive,
          say: "Don't stop. Keep pushing. Help is coming.",
        },
        BLIND_RULE,
        {
          // AHA: rotate compressors about every two minutes, fatigue degrades depth.
          id: 'swap',
          priority: 'narration',
          everyMs: 120000,
          blindSafe: true,
          when: () => true,
          say: "You're doing it. Keep going. If someone else is there, switch now and keep the rhythm.",
        },
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: 'ambulance here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'ambulance is here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'paramedics are here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'ems is here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: "they're here" }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'paramedics' }, to: 'handoff', label: 'Paramedics here' },
        { on: { kind: 'manualAdvance' }, to: 'handoff', label: 'Next' },
      ],
    },
    {
      id: 'recovery_hold',
      source: AHA_ADULT_CPR,
      say: [
        'Stay with him. Keep watching his chest.',
        'If he stops breathing, tell me right away.',
        'Wait for the ambulance.',
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: 'not breathing' }, to: 'call_911', label: 'He stopped breathing' },
        { on: { kind: 'keyword', keyword: 'ambulance here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'ambulance is here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'paramedics are here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'ems is here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: "they're here" }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'manualAdvance' }, to: 'handoff', label: 'Next' },
      ],
    },
    {
      id: 'handoff',
      source: AHA_HANDS_ONLY,
      terminal: true,
      say: ["Tell the paramedics: I'll show you the timeline on my screen."],
      transitions: [],
    },
  ],
};

/** Exported so the blind rule and the perception gate can never drift apart. */
export const CARDIAC_BLIND_THRESHOLD = BLIND_CONFIDENCE;
