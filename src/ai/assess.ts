// Scene assessment: one camera frame to a vision model, a closed label back (docs/04 item 7,
// docs/11). The only consumer is the session, which turns the label into a question the
// human answers by voice or tap; the engine never sees it (principle 1). Episodic (principle
// 3): called once or twice per triage, never on the perception -> engine -> voice path, and
// every failure returns null so the app behaves exactly as it does with no model at all. The
// frame leaves the device only behind the `sceneAssess` flag. The provider and its key live
// in the proxy (src/voice/providers/devproxy.mjs, docs/04 TODO 1); this file only knows the
// question, the answer's shape, and how to refuse a bad one. Owned by P4 (docs/07).
import type { Box, SceneAssessment, SceneLabel, Tri } from '../types';

export const SCENE_LABELS: readonly SceneLabel[] = ['collapsed', 'bleeding', 'choking', 'unclear'];
const TRI: readonly Tri[] = ['yes', 'no', 'unclear'];
const CONFIDENCE: readonly SceneAssessment['confidence'][] = ['low', 'medium', 'high'];

/** Longest side of the frame the session sends; the parser needs it for pixel coordinates. */
export const ASSESS_FRAME_PX = 640;
export const ASSESS_TIMEOUT_MS = 4000;
export const DEFAULT_ASSESS_ENDPOINT = '/api/proxy/vision/assess';

export const ASSESS_SYSTEM =
  "You are looking at one photo from a bystander's phone at a medical emergency. Say only what is visible in the photo. Never give advice, instructions or a diagnosis.";

export const ASSESS_USER = [
  'Answer with one JSON object and nothing else, with exactly these keys:',
  '"label": "collapsed" if a person is down and not moving, "bleeding" if heavy bleeding or a wound is visible, "choking" if an upright person is clutching their throat or struggling for air, otherwise "unclear".',
  '"confidence": "low", "medium" or "high".',
  '"scene": one short sentence describing what is visible. No advice.',
  '"patient": the box around the person in trouble as [ymin, xmin, ymax, xmax] on a 0 to 1000 scale, or null.',
  '"awake": "yes", "no" or "unclear". "breathing": "yes", "no" or "unclear". "pain": "yes", "no" or "unclear", from the face or posture. "bleeding_visible": "yes", "no" or "unclear".',
  '"materials": cloth, towels or clothing visible that could press on a wound, as a list of short strings.',
].join('\n');

/** Words that mean the model is coaching. The screen never shows such a sentence. */
const ADVICE =
  /\b(you should|call 911|press (on|down)|push (on|down)|apply pressure|start cpr|give (him|her|them)|perform|tourniquet|rescue breath|mouth to mouth|aed|defibrillator|aspirin|medication)\b/i;

/** What every failure collapses to: nothing to ask about. */
export const UNCLEAR: Omit<SceneAssessment, 'model' | 'latencyMs'> = {
  label: 'unclear',
  confidence: 'low',
  scene: '',
  patient: null,
  cues: { awake: 'unclear', breathing: 'unclear', pain: 'unclear', bleedingVisible: 'unclear' },
  materials: [],
};

export type AssessRequest = { image: string; mime: 'image/jpeg'; width: number; height: number };

export interface SceneAssessor {
  /** Null on any miss: timeout, refusal, bad JSON, no key. The caller then does nothing. */
  assess(req: AssessRequest): Promise<SceneAssessment | null>;
}

/** The first JSON object in a model reply, tolerant of code fences and prose around it. */
export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function tri(v: unknown): Tri {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (TRI as readonly string[]).includes(s) ? (s as Tri) : 'unclear';
}

function labelOf(v: unknown): SceneLabel {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (SCENE_LABELS as readonly string[]).includes(s) ? (s as SceneLabel) : 'unclear';
}

function confidenceOf(v: unknown): SceneAssessment['confidence'] {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (CONFIDENCE as readonly string[]).includes(s) ? (s as SceneAssessment['confidence']) : 'low';
}

/** One sentence for the screen, or nothing when the model started coaching. */
export function sceneOf(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.replace(/\s+/g, ' ').trim().slice(0, 160);
  return ADVICE.test(s) ? '' : s;
}

function materialsOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.trim().toLowerCase().slice(0, 40))
    .filter((m) => m.length > 0)
    .slice(0, 5);
}

/**
 * A box from the model, normalized to 0..1. Qwen3-VL and Gemini answer on a 0 to 1000 scale
 * as asked; Qwen2.5-VL answers in pixels of the image it saw, whatever it is asked. Either
 * order of corners is accepted; a sliver or nonsense is dropped.
 */
export function parseBox(v: unknown, frame: { width: number; height: number }, pixels: boolean): Box | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [a, b, c, d] = v as number[];
  const max = Math.max(a, b, c, d);
  let ymin: number;
  let xmin: number;
  let ymax: number;
  let xmax: number;
  if (max <= 1) [ymin, xmin, ymax, xmax] = [a, b, c, d];
  else if (pixels && frame.width > 0 && frame.height > 0) [ymin, xmin, ymax, xmax] = [a / frame.height, b / frame.width, c / frame.height, d / frame.width];
  else [ymin, xmin, ymax, xmax] = [a / 1000, b / 1000, c / 1000, d / 1000];
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin];
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const box = { x: clamp(xmin), y: clamp(ymin), w: clamp(xmax) - clamp(xmin), h: clamp(ymax) - clamp(ymin) };
  return box.w < 0.02 || box.h < 0.02 ? null : box;
}

/** Never throws: anything the model got wrong becomes `unclear`, and an unclear answer asks nothing. */
export function parseAssessment(
  text: string,
  meta: { model: string; latencyMs: number; frame: { width: number; height: number } },
): SceneAssessment {
  const obj = extractJson(text);
  const base = { model: meta.model, latencyMs: meta.latencyMs };
  if (!obj) return { ...UNCLEAR, ...base };
  return {
    label: labelOf(obj.label),
    confidence: confidenceOf(obj.confidence),
    scene: sceneOf(obj.scene),
    patient: parseBox(obj.patient, meta.frame, /qwen2\.5-vl/i.test(meta.model)),
    cues: {
      awake: tri(obj.awake),
      breathing: tri(obj.breathing),
      pain: tri(obj.pain),
      bleedingVisible: tri(obj.bleeding_visible ?? obj.bleedingVisible),
    },
    materials: materialsOf(obj.materials),
    ...base,
  };
}

export type AssessorOptions = {
  /** The proxy route. Same origin as the page, so the phone reaches it over its own https URL. */
  endpoint?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

/** The real thing: one POST to the proxy, which holds the key and picks the model. */
export function createSceneAssessor(opts: AssessorOptions = {}): SceneAssessor {
  const endpoint = opts.endpoint ?? DEFAULT_ASSESS_ENDPOINT;
  const doFetch = opts.fetch ?? (typeof fetch === 'function' ? fetch : null);
  const timeoutMs = opts.timeoutMs ?? ASSESS_TIMEOUT_MS;
  const now = opts.now ?? (() => Date.now());
  return {
    async assess(req) {
      if (!doFetch) return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = now();
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image: req.image, mime: req.mime, system: ASSESS_SYSTEM, user: ASSESS_USER, maxTokens: 320 }),
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const json = (await res.json()) as { text?: unknown; model?: unknown };
        if (typeof json.text !== 'string') return null;
        const model = typeof json.model === 'string' ? json.model : 'unknown';
        return parseAssessment(json.text, { model, latencyMs: now() - started, frame: { width: req.width, height: req.height } });
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const STUB_SCENES: Record<SceneLabel, string> = {
  collapsed: 'A person is lying on the floor, not moving.',
  bleeding: 'A person is on the ground with blood on their shirt near the shoulder.',
  choking: 'A person is standing bent forward with both hands at their throat.',
  unclear: '',
};

/** The `?fake=1` stand-in: a canned answer after a short wait, so the flow demos with no key. */
export function createStubSceneAssessor(pick: () => SceneLabel, delayMs = 900): SceneAssessor {
  return {
    async assess() {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const label = pick();
      const unclear = label === 'unclear';
      return {
        ...UNCLEAR,
        label,
        confidence: unclear ? 'low' : 'high',
        scene: STUB_SCENES[label],
        patient: unclear ? null : { x: 0.18, y: 0.5, w: 0.64, h: 0.3 },
        cues: {
          awake: label === 'collapsed' ? 'no' : unclear ? 'unclear' : 'yes',
          breathing: 'unclear',
          pain: label === 'bleeding' || label === 'choking' ? 'yes' : 'unclear',
          bleedingVisible: label === 'bleeding' ? 'yes' : 'no',
        },
        materials: label === 'bleeding' ? ['shirt', 'towel'] : [],
        model: 'stub',
        latencyMs: delayMs,
      };
    },
  };
}
