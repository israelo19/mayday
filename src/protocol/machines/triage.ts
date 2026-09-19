// MACHINE: triage. Routing only, no medical instruction, so it cites no guideline.
// Voice is never the only path: every branch has a button twin (docs/05). The keyword list
// is generated from phrases.ts, where the words people actually say live per emergency;
// matching is stemmed, word bounded and one-letter tolerant (language.ts), so "he's chocking",
// "gunshot" and "isn't breathing" all route.
import type { Machine, Transition } from '../../types';
import { TRIAGE_ROUTES } from '../phrases';

const spoken: Transition[] = TRIAGE_ROUTES.flatMap((route) =>
  route.keywords.map((keyword) => ({ on: { kind: 'keyword' as const, keyword }, to: route.to, label: route.label })),
);

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
        ...spoken,
        // The default is the most time-critical protocol, because seconds cost survival.
        { on: { kind: 'manualAdvance' }, to: 'cardiac.scene_check', label: 'Not breathing' },
      ],
    },
  ],
};
