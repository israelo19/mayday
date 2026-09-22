// MACHINE: bleeding (severe bleeding, gunshot, stab). Pure data, docs/02.
//
// Transcribed from Stop the Bleed / American College of Surgeons bleeding control basics:
// find the source, press hard with both hands, pack the wound, do not let go. We never coach
// an improvised belt tourniquet; the tourniquet line exists only as an answer to the word.
import type { Machine } from '../../types';
import { BLIND_RULE } from './shared';

const STOP_THE_BLEED = 'https://www.stopthebleed.org/';
const ACS_BLEEDING_CONTROL = 'https://www.stopthebleed.org/training/';

/** docs/07 decision 5: the demo promises a line "within 1.5s", so the fact threshold is 1s. */
export const HANDS_OFF_MS = 1000;

export const bleeding: Machine = {
  id: 'bleeding',
  source: STOP_THE_BLEED,
  medical: true,
  initial: 'scene_safety',
  states: [
    {
      // No timer, ever. A bystander walking into live danger is the worst thing this app can cause.
      id: 'scene_safety',
      source: STOP_THE_BLEED,
      say: [
        'First: are YOU safe?',
        'If the danger is still there, do not approach. Move to safety and tell me when it is safe.',
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: 'safe' }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: "he's gone" }, to: 'call_911', label: 'Attacker gone' },
        { on: { kind: 'keyword', keyword: "i'm safe" }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: "it's safe" }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: 'safe now' }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: "they're gone" }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: 'they are gone' }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: 'gone' }, to: 'call_911', label: 'Attacker gone' },
        { on: { kind: 'keyword', keyword: 'they left' }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'keyword', keyword: 'all clear' }, to: 'call_911', label: 'I am safe' },
        { on: { kind: 'manualAdvance' }, to: 'call_911', label: 'Next' },
      ],
    },
    {
      id: 'call_911',
      source: STOP_THE_BLEED,
      call911: true,
      requiredWords: ['911'],
      say: ['Call 911 now. Speaker on, phone on the ground.'],
      transitions: [
        { on: { kind: 'timerMs', ms: 8000 }, to: 'find_wound', label: 'Called' },
        { on: { kind: 'manualAdvance' }, to: 'find_wound', label: 'Next' },
      ],
    },
    {
      // Entry hook for the flagged vision describer (docs/04 item 4). It may only name
      // materials it can see; the sentence it lands in is canonical, never model text.
      id: 'find_wound',
      source: ACS_BLEEDING_CONTROL,
      requiredWords: ['wound'],
      say: ['Find where the blood is coming from. Open or cut clothing so you can see the wound.'],
      transitions: [{ on: { kind: 'manualAdvance' }, to: 'pressure', label: 'Found it' }],
    },
    {
      id: 'pressure',
      source: ACS_BLEEDING_CONTROL,
      requiredWords: ['press', 'wound'],
      say: [
        'Take cloth if you have it. Press it hard onto the wound with both hands.',
        'Push down with your full body weight. It should be hard enough to hurt.',
        'Do not lift your hands to look. Do not stop.',
      ],
      coachingRules: [
        {
          id: 'hands-off',
          priority: 'critical',
          requires: ['handsOffMs'],
          cooldownMs: 5000,
          when: (f) => f.handsOffMs !== null && f.handsOffMs > HANDS_OFF_MS,
          say: "Don't let go! Hands back on the wound. Press harder.",
        },
        {
          id: 'encourage',
          priority: 'narration',
          requires: ['handsOnRegion'],
          forMs: 30000,
          cooldownMs: 45000,
          when: (f) => f.handsOnRegion === true,
          say: "Good. Keep that pressure. You're slowing the bleeding.",
        },
        BLIND_RULE,
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: 'blood soaking through' }, to: 'pack', label: 'Soaking through' },
        { on: { kind: 'keyword', keyword: 'still bleeding' }, to: 'pack', label: 'Still bleeding' },
        { on: { kind: 'keyword', keyword: 'soaking through' }, to: 'pack', label: 'Still bleeding' },
        { on: { kind: 'keyword', keyword: 'bleeding through' }, to: 'pack', label: 'Still bleeding' },
        { on: { kind: 'keyword', keyword: "won't stop" }, to: 'pack', label: 'Still bleeding' },
        { on: { kind: 'keyword', keyword: 'not stopping' }, to: 'pack', label: 'Still bleeding' },
        { on: { kind: 'keyword', keyword: 'ambulance here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'ambulance is here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'paramedics are here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: 'ems is here' }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'keyword', keyword: "they're here" }, to: 'handoff', label: 'Ambulance is here' },
        { on: { kind: 'manualAdvance' }, to: 'pack', label: 'Next' },
      ],
    },
    {
      id: 'pack',
      source: ACS_BLEEDING_CONTROL,
      requiredWords: ['cloth', 'wound'],
      say: [
        'Do not remove the soaked cloth. Add more cloth on top and keep pressing.',
        'If the wound is deep, push the cloth into the wound and keep pressure on it.',
      ],
      coachingRules: [
        {
          id: 'hands-off',
          priority: 'critical',
          requires: ['handsOffMs'],
          cooldownMs: 5000,
          when: (f) => f.handsOffMs !== null && f.handsOffMs > HANDS_OFF_MS,
          say: "Don't let go! Hands back on the wound. Press harder.",
        },
        BLIND_RULE,
      ],
      transitions: [
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
      source: STOP_THE_BLEED,
      terminal: true,
      say: ['Tell the paramedics how long you held pressure. It is on my screen.'],
      transitions: [],
    },
  ],
  keywordResponses: [
    {
      // Only ever spoken because the bystander said the word. We do not suggest tourniquets,
      // and we never coach an improvised one (docs/02).
      keyword: 'tourniquet',
      label: 'Should I use a tourniquet?',
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: 'If you have a real tourniquet kit, place it two to three inches above the wound, not on a joint, and tighten until the bleeding stops. Otherwise keep pressing.',
    },
    // What people ask while holding pressure. Spoken only because the person asked, never as
    // a step; the keyword earns it on its own, and ?flag=grokIntent may pick it for a sentence
    // the keyword missed (docs/04 item 8). Drafted from the cited pages the same way the
    // states were: a human verifies each line against the live page before the demo.
    {
      // Stop the Bleed: an improvised belt does not get tight enough to stop arterial bleeding.
      keyword: 'belt',
      label: 'Can I use a belt?',
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: 'A belt will not get tight enough. Keep pressing hard on the wound with both hands instead.',
    },
    {
      keyword: 'hurting him',
      label: 'Am I hurting him?',
      priority: 'correction',
      source: ACS_BLEEDING_CONTROL,
      say: "Pressure hurts, and pressure is what stops the bleeding. Don't ease off.",
    },
    {
      keyword: 'doing it right',
      label: 'Am I doing it right?',
      priority: 'correction',
      source: ACS_BLEEDING_CONTROL,
      say: "You're doing it right. Hard, steady pressure with both hands, right on the wound.",
    },
    {
      keyword: 'let go',
      label: 'Can I let go to look?',
      priority: 'correction',
      source: ACS_BLEEDING_CONTROL,
      say: "Don't lift your hands to look. Keep the pressure steady until help takes over.",
    },
    {
      // Stop the Bleed: never pull out an object; pressure goes around it.
      keyword: 'stuck in',
      label: 'Something is stuck in the wound',
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: 'If something is stuck in the wound, leave it there. Press hard around it, not on top of it.',
    },
    {
      keyword: 'so much blood',
      label: 'There is so much blood',
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: "Blood on the outside is why we press. Keep your hands hard on the wound. Don't let go.",
    },
    {
      keyword: 'pale',
      label: 'He looks pale or faint',
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: 'Losing blood makes him pale and faint. Keep the pressure on and keep talking to him.',
    },
    {
      keyword: 'clean',
      label: 'Should I clean it?',
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: "Don't try to clean it. Stopping the bleeding matters more than germs right now.",
    },
    {
      keyword: 'gloves',
      label: "I don't have gloves",
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: "Gloves or a plastic bag if they are within reach. If not, use your bare hands. Don't wait.",
    },
    {
      keyword: 'how long',
      label: 'How long do I hold it?',
      priority: 'correction',
      source: ACS_BLEEDING_CONTROL,
      say: "Until the paramedics take over. Don't let go to check.",
    },
    {
      keyword: 'scared',
      label: "I'm scared",
      priority: 'correction',
      source: STOP_THE_BLEED,
      say: "You're doing the right thing. Keep pressing. I'm right here with you.",
    },
  ],
};
