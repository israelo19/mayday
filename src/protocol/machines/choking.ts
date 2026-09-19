// MACHINE: choking (conscious adult). Pure data, docs/02.
//
// Ships as data so the architecture claim "protocols are plug-in data files, here are three"
// is literally true. Camera gesture detection for choking is out of scope (CLAUDE.md scope
// walls); this machine is reached by voice or by button from triage.
import type { Machine } from '../../types';

const RED_CROSS_CHOKING = 'https://www.redcross.org/take-a-class/resources/learn-first-aid/adult-child-choking';

export const choking: Machine = {
  id: 'choking',
  source: RED_CROSS_CHOKING,
  medical: true,
  initial: 'confirm',
  states: [
    {
      id: 'confirm',
      source: RED_CROSS_CHOKING,
      say: [
        'Can he cough or speak? If he can cough, let him cough.',
        "If he cannot make a sound, tell me: he can't breathe.",
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: "can't breathe" }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'no sound' }, to: 'back_blows', label: 'No sound' },
        { on: { kind: 'keyword', keyword: 'cannot breathe' }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: "can't cough" }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'cannot cough' }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: "can't talk" }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: "can't speak" }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'no air' }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'silent' }, to: 'back_blows', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'coughing' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'keyword', keyword: 'he can cough' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'keyword', keyword: 'she can cough' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'keyword', keyword: 'talking' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'manualAdvance' }, to: 'back_blows', label: 'Next' },
      ],
    },
    {
      id: 'encourage_cough',
      source: RED_CROSS_CHOKING,
      say: [
        'Good. Keep him coughing. Do not hit his back while he can cough.',
        'Stay with him. If he stops making sound, tell me.',
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: "can't breathe" }, to: 'back_blows', label: 'He stopped coughing' },
        { on: { kind: 'manualAdvance' }, to: 'back_blows', label: 'Next' },
      ],
    },
    {
      id: 'back_blows',
      source: RED_CROSS_CHOKING,
      requiredWords: ['five', 'shoulder blades'],
      say: [
        'Stand behind him and lean him forward.',
        'Hit him five times between the shoulder blades with the heel of your hand.',
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: 'still choking' }, to: 'abdominal_thrusts', label: 'Still choking' },
        { on: { kind: 'keyword', keyword: 'still stuck' }, to: 'abdominal_thrusts', label: 'Still choking' },
        { on: { kind: 'keyword', keyword: 'not working' }, to: 'abdominal_thrusts', label: 'Still choking' },
        { on: { kind: 'keyword', keyword: 'nothing happened' }, to: 'abdominal_thrusts', label: 'Still choking' },
        { on: { kind: 'keyword', keyword: 'it came out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'came out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'popped out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: "it's out" }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'breathing now' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'dislodged' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'he passed out' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'keyword', keyword: 'unconscious' }, to: 'cardiac.position', label: 'Unconscious' },
        { on: { kind: 'keyword', keyword: 'passed out' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'keyword', keyword: 'collapsed' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'keyword', keyword: 'not breathing' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'manualAdvance' }, to: 'abdominal_thrusts', label: 'Next' },
      ],
    },
    {
      id: 'abdominal_thrusts',
      source: RED_CROSS_CHOKING,
      requiredWords: ['five', 'fist'],
      say: [
        'Stand behind him. Make a fist just above his belly button.',
        'Grab your fist with your other hand. Pull hard, inward and upward, five times.',
        'If it does not come out, we go back to back blows.',
      ],
      transitions: [
        { on: { kind: 'keyword', keyword: 'it came out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'came out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'popped out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: "it's out" }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'breathing now' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'dislodged' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'he passed out' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'keyword', keyword: 'unconscious' }, to: 'cardiac.position', label: 'Unconscious' },
        { on: { kind: 'keyword', keyword: 'passed out' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'keyword', keyword: 'collapsed' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'keyword', keyword: 'not breathing' }, to: 'cardiac.position', label: 'He passed out' },
        { on: { kind: 'manualAdvance' }, to: 'back_blows', label: 'Back blows again' },
      ],
    },
    {
      id: 'resolved',
      source: RED_CROSS_CHOKING,
      terminal: true,
      say: ['Good. Stay with him until the ambulance arrives. Keep watching his breathing.'],
      transitions: [],
    },
  ],
};
