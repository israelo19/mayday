// MACHINE: choking (conscious adult). Pure data, docs/02.
//
// Ships as data so the architecture claim "protocols are plug-in data files, here are three"
// is literally true. Camera gesture detection for choking is out of scope (CLAUDE.md scope
// walls); this machine is reached by voice or by button from triage. Like every medical
// machine it tells the bystander to call 911 within its first two states (docs/02), and the
// call is always the human's: the app renders a button and a SIMULATED dispatcher, never a line.
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
        { on: { kind: 'keyword', keyword: "can't breathe" }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'no sound' }, to: 'call_911', label: 'No sound' },
        { on: { kind: 'keyword', keyword: 'cannot breathe' }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: "can't cough" }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'cannot cough' }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: "can't talk" }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: "can't speak" }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'no air' }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'silent' }, to: 'call_911', label: 'Cannot breathe' },
        { on: { kind: 'keyword', keyword: 'coughing' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'keyword', keyword: 'he can cough' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'keyword', keyword: 'she can cough' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'keyword', keyword: 'talking' }, to: 'encourage_cough', label: 'He is coughing' },
        { on: { kind: 'manualAdvance' }, to: 'call_911', label: 'Next' },
      ],
    },
    {
      // Red Cross: have someone call 911 while care starts. The rescuer stands behind the
      // patient, so the phone goes down somewhere it can still be heard.
      id: 'call_911',
      source: RED_CROSS_CHOKING,
      call911: true,
      requiredWords: ['911'],
      say: ['Call 911 now. Put the phone on speaker and set it down where you can hear me.'],
      transitions: [
        { on: { kind: 'timerMs', ms: 8000 }, to: 'back_blows', label: 'Called' },
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
        { on: { kind: 'keyword', keyword: "can't breathe" }, to: 'call_911', label: 'He stopped coughing' },
        { on: { kind: 'keyword', keyword: 'stopped coughing' }, to: 'call_911', label: 'He stopped coughing' },
        { on: { kind: 'keyword', keyword: 'no sound' }, to: 'call_911', label: 'He stopped coughing' },
        { on: { kind: 'keyword', keyword: 'it came out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: 'came out' }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'keyword', keyword: "it's out" }, to: 'resolved', label: 'It came out' },
        { on: { kind: 'manualAdvance' }, to: 'call_911', label: 'Next' },
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
      // Not terminal: the object is out, but the bystander stays until EMS takes over, and
      // "Ambulance is here" must land on a handoff line, not on "wait for the ambulance".
      id: 'resolved',
      source: RED_CROSS_CHOKING,
      say: ['Good. Stay with him until the ambulance arrives. Keep watching his breathing.'],
      transitions: [
        { on: { kind: 'keyword', keyword: 'not breathing' }, to: 'cardiac.position', label: 'He stopped breathing' },
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
      source: RED_CROSS_CHOKING,
      terminal: true,
      say: ['Tell the paramedics what happened and how long it took. It is on my screen.'],
      transitions: [],
    },
  ],
};
