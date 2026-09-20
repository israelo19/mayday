// What people say when they open the app, per emergency. Routing data, not medical text:
// none of these words is ever spoken back as an instruction. Two lists per route.
//   keywords: phrases that route on their own, word bounded, stemmed, one letter of slack.
//   cues:     single words that make a route *likely*; when no keyword fires, the cues score
//             the sentence and the app asks for confirmation ("Sounds like choking. Yes?").
//             The confirmed route is then entered by its first keyword, so the engine still
//             only ever moves on a keyword or a tap.
// Owned by P2 (docs/07); built on `polish`. Keep entries in canonical inflection: "choking"
// covers choke/choked/chokes through the stemmer, listing more than one would be a duplicate.
import type { SceneHint, SceneLabel } from '../types';
import { negatedWord, stemKey, tokens } from './language';

export type TriageRoute = {
  to: string;
  label: string;
  /** Spoken to confirm a suggestion; a question about the phone's understanding, not advice. */
  confirm: string;
  keywords: readonly string[];
  cues: Readonly<Record<string, number>>;
};

export const TRIAGE_ROUTES: readonly TriageRoute[] = [
  {
    to: 'cardiac.scene_check',
    label: 'Not breathing',
    confirm: 'It sounds like he is not breathing. Say yes, or tap.',
    keywords: [
      'not breathing',
      "isn't breathing",
      'stopped breathing',
      'no breathing',
      'not breathing at all',
      "doesn't breathe",
      'no pulse',
      'collapsed',
      'heart attack',
      'cardiac arrest',
      'heart stopped',
      'unconscious',
      'unresponsive',
      'not responding',
      'not waking up',
      "won't wake up",
      'passed out',
      'out cold',
      'turning blue',
      'lips are blue',
      'no heartbeat',
      'lifeless',
      'cpr',
      'dropped dead',
      'flatlined',
    ],
    // No grey/gray/ashen here on purpose: "the poor man went down in the hallway and he is
    // grey" is the sentence the cues are meant to miss, so the intent router has something
    // real to catch (README, and web/session.test.ts asserts the router is the one asked).
    cues: { heart: 2, puls: 2, collaps: 2, unconscious: 2, unrespons: 2, faint: 1, blue: 1, dead: 2, dying: 1, cpr: 2, cardiac: 2, arrest: 1, wak: 1, lifeless: 2, drop: 1, fell: 1, breath: 1, limp: 1, motionless: 2 },
  },
  {
    to: 'bleeding.scene_safety',
    label: 'Shot or bleeding',
    confirm: 'It sounds like someone is bleeding badly. Say yes, or tap.',
    keywords: [
      'bleeding',
      'bleeding badly',
      'bleeding out',
      'shot',
      'gunshot',
      'gun shot',
      'shooting',
      'stabbed',
      'knife',
      'blood',
      'blood everywhere',
      'lot of blood',
      'cut',
      'deep cut',
      'wound',
      'gash',
      'slashed',
      'hemorrhaging',
      'bullet',
      'gunshot wound',
      'stab wound',
      'losing blood',
      'artery',
      'glass',
    ],
    cues: { blood: 2, bleed: 2, shot: 2, shoot: 2, gun: 2, stab: 2, knif: 2, cut: 1, wound: 2, hemorrhag: 2, gash: 2, slash: 2, bullet: 2, gunshot: 2, laceration: 2, arter: 2, spurt: 2, red: 1, soak: 1, glass: 1 },
  },
  {
    to: 'choking.confirm',
    label: 'Choking',
    confirm: 'It sounds like he is choking. Say yes, or tap.',
    keywords: [
      'choking',
      "can't breathe",
      'cannot breathe',
      "can't get air",
      'no air',
      'something stuck',
      'stuck in his throat',
      'stuck in her throat',
      'stuck in their throat',
      'airway',
      'heimlich',
      'grabbing his throat',
      'grabbing her throat',
      'holding his throat',
      'holding her throat',
      'swallowed something',
      'food stuck',
      'lodged',
      "can't swallow",
      'gagging',
    ],
    cues: { chok: 3, throat: 2, airway: 2, stuck: 1, swallow: 1, food: 1, gag: 1, heimlich: 3, lodg: 2, cough: 1, silent: 1, air: 1, eat: 1, ate: 1, chew: 1, neck: 1 },
  },
];

/**
 * What each camera cue suggests (docs/03 "Scene hint"). Routing data like the cues above: the
 * confirm line is a question about what the phone saw, the keyword is one triage already
 * accepts, and nothing moves until the human says yes or taps.
 */
export const SCENE_HINTS: Readonly<Record<SceneHint, { to: string; label: string; keyword: string; confirm: string }>> = {
  person_down: {
    to: 'cardiac.scene_check',
    label: 'Collapsed',
    keyword: 'collapsed',
    confirm: 'It looks like someone has collapsed. Say yes, or tap.',
  },
};

/**
 * What a scene model's label suggests (docs/04 item 7). Same shape and same rule as
 * SCENE_HINTS: the keyword is one triage already accepts, the confirm line is a question about
 * what the camera saw, and nothing moves until the human says yes or taps.
 */
export const ASSESSMENT_HINTS: Readonly<Record<Exclude<SceneLabel, 'unclear'>, { to: string; label: string; keyword: string; confirm: string }>> = {
  collapsed: { to: 'cardiac.scene_check', label: 'Collapsed', keyword: 'collapsed', confirm: 'It looks like someone has collapsed. Say yes, or tap.' },
  bleeding: { to: 'bleeding.scene_safety', label: 'Shot or bleeding', keyword: 'bleeding', confirm: 'It looks like someone is bleeding badly. Say yes, or tap.' },
  choking: { to: 'choking.confirm', label: 'Choking', keyword: 'choking', confirm: 'It looks like someone is choking. Say yes, or tap.' },
};

/**
 * Asked when a model matched a sentence to a move the state already offers and there is no
 * written confirm line for it (docs/04 item 8). App text about the phone's own hearing, not
 * about the patient: it quotes the button's label back and waits for a yes.
 */
export function confirmLine(label: string): string {
  return `Did you say ${label.toLowerCase().replace(/[.?!]+$/, '')}? Say yes, or tap.`;
}

/** First keyword of a route: the one a confirmed suggestion is entered by. */
export function routeKeyword(route: TriageRoute): string {
  return route.keywords[0];
}

export type Suggestion = { route: TriageRoute; score: number };

/** Score threshold and margin over the runner-up before the app asks "did you mean". */
export const SUGGEST_MIN_SCORE = 2;
export const SUGGEST_MIN_MARGIN = 1;

/**
 * The most likely route for a sentence no keyword matched, or null when the cues are too weak
 * or too evenly split to ask about. Cue stems are compared to the stemmed transcript words
 * with the same one-letter slack the matcher uses, and a negated cue does not count: the
 * matcher has always refused "it's not safe" as safe, while the scorer read "there is no blood
 * anywhere" as bleeding and "he is not choking, he just fainted" as choking, which is the
 * person being contradicted by the phone in the one sentence where they were most explicit.
 */
export function suggestRoute(transcript: string, routes: readonly TriageRoute[] = TRIAGE_ROUTES): Suggestion | null {
  const words = tokens(transcript);
  if (words.length === 0) return null;
  const hits = (cue: string): boolean =>
    words.some((w, i) => (w === cue || (cue.length >= 4 && w.startsWith(cue))) && !negatedWord(words, i));
  const scored = routes
    .map((route) => {
      let score = 0;
      for (const [cue, weight] of Object.entries(route.cues)) {
        if (hits(cue)) score += weight;
      }
      return { route, score };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < SUGGEST_MIN_SCORE) return null;
  if (second && best.score - second.score < SUGGEST_MIN_MARGIN) return null;
  return best;
}

/** Words that confirm or reject a suggestion. Checked by the session, never by the engine. */
export const CONFIRM_WORDS: readonly string[] = ['yes', 'yeah', 'yep', 'yup', 'correct', 'right', "that's right", 'exactly', 'do it'];
export const REJECT_WORDS: readonly string[] = ['no', 'nope', 'wrong', "that's wrong", 'not that', 'never mind'];

/** Keywords across all routes that would collide after stemming, for the test that forbids it. */
export function stemCollisions(keywords: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const k of keywords) {
    const key = stemKey(k);
    groups.set(key, [...(groups.get(key) ?? []), k]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
