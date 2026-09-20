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
        // No bare 'paramedics': one common noun ended the run. "The paramedics are not here
        // yet" reached it, because the negation sits after the word and guards only look
        // before it, and the handoff opened in the middle of compressions. The four phrases
        // above all say the crew has arrived; the word on its own does not.
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
  // What people ask mid-CPR. Each is spoken only because the person asked, never as a step,
  // and moves nothing; the keyword earns it on its own, and ?flag=grokIntent may pick it for a
  // sentence the keyword missed (docs/04 item 8). Drafted from the cited pages the same way
  // the states were: a human verifies each line against the live page before the demo.
  keywordResponses: [
    {
      keyword: 'hard enough',
      label: 'Am I pushing hard enough?',
      priority: 'correction',
      source: AHA_ADULT_BLS,
      say: 'Push about two inches down, then let the chest come all the way back up. Hard is right.',
    },
    {
      keyword: 'doing it right',
      label: 'Am I doing it right?',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: "You're doing it right. Push hard, push fast, and let the chest come all the way back up.",
    },
    {
      keyword: 'ribs',
      label: 'I felt a rib crack',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: 'A crack or a pop can happen when you push hard enough. It is not a reason to stop. Keep going.',
    },
    {
      keyword: 'hurting him',
      label: 'Am I hurting him?',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: 'You might, and that is okay. Pushing hard is what gives him a chance. Do not ease off.',
    },
    {
      keyword: 'should i stop',
      label: 'Should I stop?',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: "Don't stop unless he starts breathing or moving on his own, or someone takes over. Keep pushing.",
    },
    {
      // AHA: rotate compressors about every two minutes, and keep the switch under five seconds.
      keyword: 'tired',
      label: "I'm getting tired",
      priority: 'correction',
      source: AHA_ADULT_BLS,
      say: 'If someone else is there, switch now, in under five seconds. If you are alone, keep going. Any CPR is better than none.',
    },
    {
      keyword: 'turning blue',
      label: "He's turning blue",
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: 'Blue lips mean he needs the blood you are pumping. Keep pushing hard and fast.',
    },
    {
      // AHA: lay rescuers do not check for a pulse; the check costs compressions.
      keyword: 'check for a pulse',
      label: 'Should I check for a pulse?',
      priority: 'correction',
      source: AHA_ADULT_BLS,
      say: "Don't stop to check for a pulse. Your pushing is his pulse right now.",
    },
    {
      keyword: 'mouth to mouth',
      label: 'Should I give breaths?',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: 'No breaths. Hands-only CPR is what he needs from you. Just keep pushing.',
    },
    {
      keyword: 'vomit',
      label: "He's vomiting",
      priority: 'correction',
      source: AHA_ADULT_CPR,
      say: 'Turn him onto his side, wipe out his mouth, roll him back, and keep pushing.',
    },
    {
      keyword: 'aed',
      label: 'Someone has an AED',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: 'Turn the AED on and do exactly what it says. Keep pushing until it tells you to stop.',
    },
    {
      keyword: 'alone',
      label: "I'm alone",
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: 'You can do this alone. Hands-only CPR is enough. Keep the beat and keep pushing.',
    },
    {
      keyword: 'how long',
      label: 'How long do I keep going?',
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: "Until the paramedics take over, or he starts breathing on his own. Don't count the minutes. Keep the beat.",
    },
    {
      keyword: 'scared',
      label: "I'm scared",
      priority: 'correction',
      source: AHA_HANDS_ONLY,
      say: "You are doing the right thing. Stay with the beat. I'm right here with you.",
    },
  ],
};

/** Exported so the blind rule and the perception gate can never drift apart. */
export const CARDIAC_BLIND_THRESHOLD = BLIND_CONFIDENCE;
