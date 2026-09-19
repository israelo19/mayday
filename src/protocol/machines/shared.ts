// Rules shared by every machine that watches. Defined once so the wording of the most
// important honesty line in the app cannot drift between protocols (principle 4).
import type { Rule } from '../../types';

/**
 * Perception stopped being trustworthy. Spoken as critical because it changes what the
 * bystander should expect, logged as system because it is not medical advice (docs/07 decision 1).
 */
export const BLIND_RULE: Rule = {
  id: 'blind',
  priority: 'critical',
  logKind: 'system',
  blindSafe: true,
  cooldownMs: 20000,
  when: (_f, ctx) => ctx.blind,
  say: "I can't see you clearly. I'll keep coaching by voice. Keep going.",
};
