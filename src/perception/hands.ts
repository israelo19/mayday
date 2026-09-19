// HandLandmarker loader and the reduction of 21 landmarks to a palm centre. The pure ROI
// state machine lives in roi.ts. Owned by P1.
import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { loadVisionFileset, type Delegate } from './pose';
import { handWidth, palmCenter, type Hand } from './roi';

export type { Hand, Roi, RoiState } from './roi';
export { RoiTracker, ChokingGestureDetector, DEFAULT_ROI_OPTIONS } from './roi';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const HAND_MODEL_URL = `${base}/models/hand_landmarker.task`;

export async function loadHandLandmarker(): Promise<{ landmarker: HandLandmarker; delegate: Delegate }> {
  const fileset = await loadVisionFileset();
  let lastErr: unknown = null;
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { landmarker, delegate };
    } catch (err) {
      lastErr = err;
      console.warn(`[hands] ${delegate} delegate failed to initialize`, err);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('HandLandmarker failed to load');
}


export function toHands(result: HandLandmarkerResult): Hand[] {
  return result.landmarks.map((lm) => {
    const c = palmCenter(lm);
    return { cx: c.x, cy: c.y, width: handWidth(lm) };
  });
}
