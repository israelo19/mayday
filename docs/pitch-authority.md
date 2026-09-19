# Slide: authority is deterministic

For P4's deck. One slide, three claims, each pointing at code a judge can open.

## The claim

No language model ever selects, orders, invents or modifies a medical instruction. Every line
Mayday speaks is transcribed from a published guideline and stored as typed data compiled into
the bundle.

## The evidence

**Machines are data, and the data is linted.** Four machines in `src/protocol/machines`:
triage, cardiac, bleeding, choking. The linter in `src/protocol/lint.ts` fails the build on a
dead state, a duplicate keyword, a state with no NEXT button, a transition pointing nowhere, or
a medical state with no cited guideline URL. Every cited page was opened before the line landed.

**The engine cannot improvise.** `src/protocol/engine.ts` is a pure function of machine data,
facts, keywords and time. It reads no clock, makes no network call and uses no randomness; a
test greps the module and fails the build if any of those appear.

**A paraphrase is checked before it is spoken.** `src/protocol/validate.ts` rejects a model's
rewrite that drops a number, drops a word the state requires, or introduces guidance we do not
give. Rescue breaths, aspirin, an AED, a tourniquet: any of them appearing in a paraphrase
sends the canonical line to the speaker instead.

## The failure mode we care most about

Silent wrong output. The engine treats perception as blind when confidence drops, when facts
are more than two seconds stale, and when perception never reported at all. While blind, only
rules marked blind-safe may speak, and the app says out loud that it has stopped watching. A
frozen number can never coach.

The same honesty reaches the handoff report: time the camera could not see is printed as
unmeasured, never as a pause. We will not tell a paramedic the bystander stopped compressions
when the truth is that we could not see.

## Numbers for the slide

| | |
|---|---|
| Tests | 204, fake clock throughout |
| Machines | 4, every medical state citing a live guideline URL |
| Engine | 240 lines of code plus a 55-line rule evaluator, zero dependencies |
| Network calls in the coaching path | 0, enforced by a test |
