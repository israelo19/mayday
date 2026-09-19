// MACHINE: triage. Routing only, no medical instruction, so it cites no guideline.
// Voice is never the only path: every branch has a button twin (docs/05).
import type { Machine } from '../../types';

export const triage: Machine = {
  id: 'triage',
  source: 'routing only, no medical instruction',
  medical: false,
  initial: 'listening',
  states: [
    {
      id: 'listening',
      source: 'routing only, no medical instruction',
      say: ["Tell me what's happening. Say things like: he's not breathing, she's choking, he got shot."],
      transitions: [
        { on: { kind: 'keyword', keyword: 'not breathing' }, to: 'cardiac.scene_check', label: 'Not breathing' },
        { on: { kind: 'keyword', keyword: 'no pulse' }, to: 'cardiac.scene_check', label: 'No pulse' },
        { on: { kind: 'keyword', keyword: 'collapsed' }, to: 'cardiac.scene_check', label: 'Collapsed' },
        { on: { kind: 'keyword', keyword: 'heart attack' }, to: 'cardiac.scene_check', label: 'Heart attack' },
        { on: { kind: 'keyword', keyword: 'cardiac arrest' }, to: 'cardiac.scene_check', label: 'Cardiac arrest' },
        { on: { kind: 'keyword', keyword: 'unconscious' }, to: 'cardiac.scene_check', label: 'Unconscious' },
        { on: { kind: 'keyword', keyword: 'shot' }, to: 'bleeding.scene_safety', label: 'Gunshot' },
        { on: { kind: 'keyword', keyword: 'stabbed' }, to: 'bleeding.scene_safety', label: 'Stabbed' },
        { on: { kind: 'keyword', keyword: 'bleeding' }, to: 'bleeding.scene_safety', label: 'Bleeding badly' },
        { on: { kind: 'keyword', keyword: 'blood' }, to: 'bleeding.scene_safety', label: 'A lot of blood' },
        { on: { kind: 'keyword', keyword: 'choking' }, to: 'choking.confirm', label: 'Choking' },
        { on: { kind: 'keyword', keyword: "can't breathe" }, to: 'choking.confirm', label: 'Cannot breathe' },
        // The default is the most time-critical protocol, because seconds cost survival.
        { on: { kind: 'manualAdvance' }, to: 'cardiac.scene_check', label: 'Not breathing' },
      ],
    },
  ],
};
