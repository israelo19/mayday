# Status check, Sat ~04:00

Quick alignment check across everyone's merged work plus what's still sitting unmerged.
Not a decision log (that's `DECISIONS.md`) -- this is "here's where the four branches
actually stand today," for whoever's next on main.

## What's on `main` and working

P1 (perception), P3 (voice), P4 (screens + PWA + deploy groundwork), and the guide gallery
are all merged and technically consistent with each other: `npm run typecheck`, `npm run
lint`, and `npm test` (90 tests) are all green as of this branch.

## The gap: no brain

`src/types.ts` on `main` is still the original M0 version (`PerceptionFacts` /
`CoachingEvent` / `EventLogEntry` only). There is no `src/protocol`, no `src/sitrep`, no
`src/session.ts` anywhere on `main`. **The deterministic engine has never merged.**

The `p2-brain` branch that had this work got deleted at some point and was recovered under
`recovered/p2-brain` -- but that branch diverged from `main` at the very first commit of the
whole project (`cd9392d`), before any perception, voice, or screen work existed. It is not a
small rebase; it predates almost everything currently on `main`.

Practical effect: the app currently has perception, voice, and four screens, but nothing
decides which protocol applies or drives real coaching. The screens run on hardcoded mock
data (`src/ui/mockDemoData.ts`) that always assumes a cardiac-arrest scenario, because there's
no triage state machine to ask.

**This is the M1 gate from docs/06.** Per the kill-check rule already in that doc: if this
isn't green, everyone should be on it, nothing else matters until it is.

## Also worth a quick sync

`claude/expo-go-server-refactor-eb1260` (unmerged) builds an Expo Go native shell around the
web app. `CLAUDE.md`'s scope walls say "no native app." Might be leftover exploration, might
be a real scope change someone should say out loud before more time goes into it either way.

## Not a problem, just noting it

PR #8's docs reframed the pitch as "coaching any emergency," but the actual scope wall this
weekend (cardiac, bleeding, choking-data-only; no stroke/seizure/overdose/burns) is unchanged.
Pitch framing and build scope agree.

## Suggested next step

Whoever's free: rebase/reconstruct `recovered/p2-brain`'s engine against current `main`
(perception's `Perception` interface and `src/types.ts` have both moved since it branched, so
expect real conflicts, not just stale ones) or rebuild the engine fresh against the current
`Perception`/`CoachingEvent` shapes -- whichever is faster from here. Everything else is
genuinely ready to wire up to it the moment it exists.
