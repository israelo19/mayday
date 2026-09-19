// Public surface of the protocol module. Everything medical enters the app through here,
// as data. Nothing in this module makes a network call or imports src/ai.
export { createEngine, GLOBAL_KEYWORDS, STALE_FACTS_MS, type Engine, type EngineOutput } from './engine';
export { matchKeyword, normalize, stem, stemKey, tokens } from './keywords';
export { CONFIRM_WORDS, REJECT_WORDS, routeKeyword, stemCollisions, suggestRoute, TRIAGE_ROUTES, type Suggestion, type TriageRoute } from './phrases';
export { lintMachines, type LintIssue } from './lint';
export { allDiagrams, toMermaid } from './mermaid';
export { machines, bleeding, cardiac, choking, triage, HANDS_OFF_MS } from './machines';
export { NO_FACTS } from './rules';
export { validateNarration, type Validation } from './validate';
