import { describe, expect, it } from 'vitest';
import { ASSESS_USER, createSceneAssessor, createStubSceneAssessor, extractJson, parseAssessment, parseBox, sceneOf } from './assess';

const frame = { width: 640, height: 480 };
const meta = { model: 'Qwen/Qwen3-VL-8B-Instruct', latencyMs: 12, frame };

describe('parseAssessment', () => {
  it('reads a well-formed answer, including a box on the 0 to 1000 scale', () => {
    const a = parseAssessment(
      '{"label":"bleeding","confidence":"high","scene":"A man on the floor with blood on his shirt.","patient":[500,100,900,700],"awake":"yes","breathing":"yes","pain":"yes","bleeding_visible":"yes","materials":["Shirt","Towel"]}',
      meta,
    );
    expect(a.label).toBe('bleeding');
    expect(a.confidence).toBe('high');
    expect(a.scene).toBe('A man on the floor with blood on his shirt.');
    expect(a.patient).toEqual({ x: 0.1, y: 0.5, w: 0.6, h: 0.4 });
    expect(a.cues).toEqual({ awake: 'yes', breathing: 'yes', pain: 'yes', bleedingVisible: 'yes' });
    expect(a.materials).toEqual(['shirt', 'towel']);
    expect(a.model).toBe(meta.model);
  });

  it('tolerates code fences and prose around the JSON', () => {
    const a = parseAssessment('Sure! ```json\n{"label": "choking"}\n``` Hope this helps.', meta);
    expect(a.label).toBe('choking');
    expect(extractJson('no json here')).toBeNull();
  });

  it('turns anything outside the closed set into unclear, never throws', () => {
    expect(parseAssessment('{"label":"heart attack","confidence":"certain","awake":"maybe"}', meta)).toMatchObject({
      label: 'unclear',
      confidence: 'low',
      cues: { awake: 'unclear' },
    });
    expect(parseAssessment('', meta).label).toBe('unclear');
    expect(parseAssessment('{"label": 3, "patient": "big"}', meta).patient).toBeNull();
  });

  it('drops a scene sentence that started coaching', () => {
    expect(sceneOf('A woman lying still. You should start CPR now.')).toBe('');
    expect(sceneOf('A woman lying still on a kitchen floor.')).toBe('A woman lying still on a kitchen floor.');
  });

  it('reads pixel boxes from the one model family that answers in pixels', () => {
    const pixels = { ...meta, model: 'Qwen/Qwen2.5-VL-7B-Instruct' };
    expect(parseBox([240, 64, 432, 448], frame, true)).toEqual({ x: 0.1, y: 0.5, w: 0.6, h: 0.4 });
    expect(parseAssessment('{"label":"collapsed","patient":[240,64,432,448]}', pixels).patient).toEqual({ x: 0.1, y: 0.5, w: 0.6, h: 0.4 });
    // Corners in the other order still make the same box; a sliver is nothing.
    expect(parseBox([900, 700, 500, 100], frame, false)).toEqual({ x: 0.1, y: 0.5, w: 0.6, h: 0.4 });
    expect(parseBox([500, 100, 505, 700], frame, false)).toBeNull();
  });

  it('asks for the closed set and no advice', () => {
    expect(ASSESS_USER).toContain('"collapsed"');
    expect(ASSESS_USER).toContain('"unclear"');
    expect(ASSESS_USER).toContain('No advice');
  });
});

describe('createSceneAssessor', () => {
  const ok = (body: unknown) => async () => ({ ok: true, json: async () => body }) as unknown as Response;

  it('posts the frame and the question to the proxy and parses the reply', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFake = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return ok({ text: '{"label":"collapsed","confidence":"medium"}', model: 'm' })();
    }) as unknown as typeof fetch;
    const a = createSceneAssessor({ fetch: fetchFake, now: () => 0 });
    const result = await a.assess({ image: 'AAA=', mime: 'image/jpeg', width: 640, height: 480 });
    expect(calls[0].url).toBe('/api/proxy/vision/assess');
    expect(calls[0].body).toMatchObject({ image: 'AAA=', mime: 'image/jpeg' });
    expect(result?.label).toBe('collapsed');
    expect(result?.model).toBe('m');
  });

  it('returns null on an HTTP error, a broken reply, or a thrown fetch', async () => {
    const req = { image: 'AAA=', mime: 'image/jpeg' as const, width: 640, height: 480 };
    expect(await createSceneAssessor({ fetch: (async () => ({ ok: false })) as unknown as typeof fetch }).assess(req)).toBeNull();
    expect(await createSceneAssessor({ fetch: ok({ nope: 1 }) as unknown as typeof fetch }).assess(req)).toBeNull();
    expect(
      await createSceneAssessor({
        fetch: (async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch,
      }).assess(req),
    ).toBeNull();
  });

  it('gives up after the timeout', async () => {
    const never = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const a = createSceneAssessor({ fetch: never, timeoutMs: 20 });
    expect(await a.assess({ image: 'AAA=', mime: 'image/jpeg', width: 640, height: 480 })).toBeNull();
  });
});

describe('createStubSceneAssessor', () => {
  it('answers with the label it is told to, after a short wait', async () => {
    const a = createStubSceneAssessor(() => 'bleeding', 1);
    const r = await a.assess({ image: 'x', mime: 'image/jpeg', width: 640, height: 480 });
    expect(r?.label).toBe('bleeding');
    expect(r?.patient).not.toBeNull();
    expect(r?.materials.length).toBeGreaterThan(0);
  });
});
