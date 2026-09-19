// A scene model's label may only ever enter a route by a keyword triage already accepts, so
// the hint table is checked against the routes it points at (docs/04 item 7).
import { describe, expect, it } from 'vitest';
import { ASSESSMENT_HINTS, matchKeyword, SCENE_HINTS, TRIAGE_ROUTES } from '../src/protocol';

describe('assessment hints', () => {
  it('point at a triage route and enter it by one of that route\'s own keywords', () => {
    for (const hint of [...Object.values(ASSESSMENT_HINTS), ...Object.values(SCENE_HINTS)]) {
      const route = TRIAGE_ROUTES.find((r) => r.to === hint.to);
      expect(route, hint.to).toBeDefined();
      expect(matchKeyword(hint.keyword, route!.keywords)).toBe(hint.keyword);
      expect(hint.confirm).toMatch(/Say yes, or tap\.$/);
    }
  });
});
