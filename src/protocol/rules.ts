// Coaching-rule evaluation, split out of engine.ts to keep the engine near the ~120 line
// budget in docs/02. Pure: time is an argument, never a call to Date.now().
import type { PerceptionFacts, Rule, RuleContext } from '../types';

const DEFAULT_COOLDOWN_MS = 6000;

/** Facts stood in for when perception has never reported. Every metric is absent on purpose. */
export const NO_FACTS: PerceptionFacts = {
  t: 0,
  poseConfidence: 0,
  compressionRate: null,
  compressionActive: false,
  recoilRatio: null,
  handsOnRegion: null,
  handsOffMs: null,
};

/**
 * Decides which rules fire. Cooldowns are global per rule id so that leaving and re-entering
 * a state cannot restart a nag; `forMs` and `everyMs` timers are per state entry.
 */
export class RuleEvaluator {
  private readonly lastFired = new Map<string, number>();
  private since = new Map<string, number>();
  private anchor = 0;

  /** Per-state timers restart; cooldowns deliberately survive across states within a run. */
  enterState(now: number): void {
    this.since = new Map();
    this.anchor = now;
  }

  /**
   * A new run, not a new state: forget every cooldown too. The evaluator outlives a session
   * because the engine is built once, so a second run through the same protocol inherited the
   * first one's history. A blind line that fired 3 s into take one was suppressed for another
   * twelve seconds in take two, which is exactly the beat the take was being redone for.
   */
  reset(now: number): void {
    this.lastFired.clear();
    this.enterState(now);
  }

  evaluate(rules: readonly Rule[], facts: PerceptionFacts, ctx: RuleContext, now: number): Rule[] {
    const fired: Rule[] = [];
    for (const rule of rules) {
      if (!this.holds(rule, facts, ctx)) {
        this.since.delete(rule.id);
        continue;
      }
      if (rule.forMs) {
        const since = this.since.get(rule.id);
        if (since === undefined) {
          this.since.set(rule.id, now);
          continue;
        }
        if (now - since < rule.forMs) continue;
      }
      const last = this.lastFired.get(rule.id);
      if (last !== undefined && now - last < (rule.cooldownMs ?? DEFAULT_COOLDOWN_MS)) continue;
      if (rule.everyMs && now - (last ?? this.anchor) < rule.everyMs) continue;
      this.lastFired.set(rule.id, now);
      fired.push(rule);
    }
    return fired;
  }

  /** Gates that must all pass before the predicate is even consulted. */
  private holds(rule: Rule, facts: PerceptionFacts, ctx: RuleContext): boolean {
    if (ctx.blind && !rule.blindSafe) return false;
    if (rule.requires?.some((key) => facts[key] === null)) return false;
    return rule.when(facts, ctx);
  }
}
