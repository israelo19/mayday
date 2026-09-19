// PoseLandmarker loader, docs/03. WASM runtime and model are served same-origin from
// public/wasm and public/models (see scripts/prepare-assets.mjs). Never hotlinked. Owned by P1.
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export type Delegate = 'GPU' | 'CPU';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const WASM_URL = `${base}/wasm`;
export const POSE_MODEL_URL = `${base}/models/pose_landmarker_lite.task`;

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
let filesetPromise: Promise<VisionFileset> | null = null;

/** The WASM fileset is shared by every MediaPipe task (pose now, hands in M3). */
export function loadVisionFileset(): Promise<VisionFileset> {
  filesetPromise ??= FilesetResolver.forVisionTasks(WASM_URL);
  return filesetPromise;
}

/** GPU delegate first (WebGL), CPU fallback. Lite model, VIDEO mode, one pose. */
export async function loadPoseLandmarker(): Promise<{ landmarker: PoseLandmarker; delegate: Delegate }> {
  const fileset = await loadVisionFileset();
  let lastErr: unknown = null;
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      return { landmarker, delegate };
    } catch (err) {
      lastErr = err;
      console.warn(`[pose] ${delegate} delegate failed to initialize`, err);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('PoseLandmarker failed to load');
}
