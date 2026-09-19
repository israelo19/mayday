import { describe, expect, it } from 'vitest';
import { matchKeyword, routeKeyword, stemCollisions, suggestRoute, TRIAGE_ROUTES } from '../src/protocol';

const all = TRIAGE_ROUTES.flatMap((r) => r.keywords);
const routeOf = (keyword: string) => TRIAGE_ROUTES.find((r) => r.keywords.includes(keyword))!.to;

describe('triage phrases', () => {
  it('has no two keywords that are the same words after stemming', () => {
    expect(stemCollisions(all)).toEqual([]);
  });

  it.each([
    ["he's not breathing", 'cardiac.scene_check'],
    ["my dad collapsed and he isn't breathing", 'cardiac.scene_check'],
    ['he just dropped dead in front of me', 'cardiac.scene_check'],
    ["she's turning blue", 'cardiac.scene_check'],
    ['he got shot', 'bleeding.scene_safety'],
    ['gunshot, someone got shot', 'bleeding.scene_safety'],
    ['she was stabbed with a knife', 'bleeding.scene_safety'],
    ["there's blood everywhere", 'bleeding.scene_safety'],
    ["he's bleeding really badly from his leg", 'bleeding.scene_safety'],
    ["she's choking", 'choking.confirm'],
    ["he can't breathe, something is stuck", 'choking.confirm'],
    ["she's grabbing her throat", 'choking.confirm'],
    ['do the heimlich', 'choking.confirm'],
  ])('routes "%s" to %s', (said, to) => {
    const k = matchKeyword(said, all);
    expect(k, said).not.toBeNull();
    expect(routeOf(k!)).toBe(to);
  });

  it('suggests a route from cues when no phrase matches', () => {
    expect(suggestRoute("he ate something and now he's silent and holding his neck")?.route.to).toBe('choking.confirm');
    expect(suggestRoute("my grandpa fell down and he's totally limp and dead looking")?.route.to).toBe('cardiac.scene_check');
    expect(suggestRoute('there is a pool of red stuff coming out of his leg and it is soaking his pants')?.route.to).toBe('bleeding.scene_safety');
  });

  it('stays quiet when the cues are weak or split', () => {
    expect(suggestRoute('I do not know what to do please help')).toBeNull();
    expect(suggestRoute('his heart, and also blood, and his throat')).toBeNull();
  });

  it('enters a confirmed route by a keyword the engine knows', () => {
    for (const r of TRIAGE_ROUTES) expect(all).toContain(routeKeyword(r));
  });
});
