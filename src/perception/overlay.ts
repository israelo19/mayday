// Overlay drawing for the camera preview: pose skeleton, shoulders, hands, the wound ROI.
// Pure canvas functions in video pixel space. Owned by P1. The look here is the same one
// P4 embeds in the COACH screen, so keep it quiet: thin white body, one accent colour.
import { PoseLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { SceneObservation } from '../types';
import type { Hand, Roi } from './roi';
import { LEFT_SHOULDER, RIGHT_SHOULDER, shoulderMidX, shoulderMidY } from './signal';

export const OVERLAY = {
  body: 'rgba(255,255,255,0.72)',
  joint: 'rgba(255,255,255,0.9)',
  accent: '#7fe3c6', // mint: the signal source, the locked region
  warn: '#ff453a', // red: hands off the wound
  dim: 'rgba(255,255,255,0.28)',
} as const;

/** Body-only connections: face landmarks 0..10 are noise for our purposes. */
const BODY_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS.filter((c) => c.start > 10 && c.end > 10);

export function drawPose(ctx: CanvasRenderingContext2D, lm: readonly NormalizedLandmark[], w: number, h: number, dim: boolean): void {
  ctx.lineWidth = Math.max(1.5, w / 320);
  ctx.strokeStyle = dim ? OVERLAY.dim : OVERLAY.body;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const c of BODY_CONNECTIONS) {
    const a = lm[c.start];
    const b = lm[c.end];
    if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) continue;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
  }
  ctx.stroke();

  ctx.fillStyle = dim ? OVERLAY.dim : OVERLAY.joint;
  const jr = Math.max(2, w / 240);
  for (let i = 11; i < lm.length; i++) {
    const p = lm[i];
    if (p.visibility < 0.3) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, jr, 0, Math.PI * 2);
    ctx.fill();
  }

  // The signal source: both shoulders ringed, their midpoint filled.
  const ring = Math.max(6, w / 60);
  ctx.strokeStyle = dim ? OVERLAY.dim : OVERLAY.accent;
  ctx.lineWidth = Math.max(2, w / 240);
  for (const i of [LEFT_SHOULDER, RIGHT_SHOULDER]) {
    const p = lm[i];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = dim ? OVERLAY.dim : OVERLAY.accent;
  ctx.beginPath();
  ctx.arc(shoulderMidX(lm) * w, shoulderMidY(lm) * h, ring * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A dashed box and a word per person the pose model sees (docs/11): what the eyes make of
 * the scene, drawn on the picture. Lying reads red because that is the person triage asks
 * about; the label is a measurement, never a diagnosis.
 */
export function drawPeople(ctx: CanvasRenderingContext2D, scene: SceneObservation, w: number, h: number): void {
  const font = Math.max(12, Math.round(w / 40));
  ctx.font = `600 ${font}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  for (const p of scene.people) {
    const x = p.box.x * w;
    const y = p.box.y * h;
    const lying = p.posture === 'lying';
    ctx.strokeStyle = lying ? OVERLAY.warn : OVERLAY.body;
    ctx.lineWidth = Math.max(1.5, w / 360);
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x, y, p.box.w * w, p.box.h * h);
    ctx.setLineDash([]);
    const posture = p.posture === 'unknown' ? 'person' : p.posture;
    const label = p.stillMs >= 1000 ? `${posture} · still ${Math.floor(p.stillMs / 1000)}s` : `${posture} · moving`;
    const pad = font * 0.4;
    const width = ctx.measureText(label).width + pad * 2;
    const top = Math.max(0, y - font - pad * 2);
    ctx.fillStyle = lying ? OVERLAY.warn : 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, top, width, font + pad * 2);
    ctx.fillStyle = lying ? '#fff' : OVERLAY.joint;
    ctx.fillText(label, x + pad, top + pad);
  }
}

export function drawHands(ctx: CanvasRenderingContext2D, hands: readonly Hand[], w: number, h: number, roi: Roi): void {
  for (const hand of hands) {
    const inside = roi.state === 'locked' && Math.hypot(hand.cx - roi.cx, hand.cy - roi.cy) <= roi.r;
    ctx.strokeStyle = roi.state === 'locked' ? (inside ? OVERLAY.accent : OVERLAY.warn) : OVERLAY.body;
    ctx.lineWidth = Math.max(2, w / 240);
    ctx.beginPath();
    ctx.arc(hand.cx * w, hand.cy * h, Math.max(8, (hand.width * w) / 2), 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawRoi(ctx: CanvasRenderingContext2D, roi: Roi, w: number, h: number): void {
  if (roi.state !== 'locked' && roi.state !== 'locking') return;
  const r = roi.state === 'locked' ? roi.r : 0.08;
  const x = roi.cx * w;
  const y = roi.cy * h;
  ctx.setLineDash(roi.state === 'locking' ? [6, 6] : []);
  ctx.lineWidth = Math.max(2, w / 200);
  ctx.strokeStyle = roi.state === 'locked' ? (roi.handsOn ? OVERLAY.accent : OVERLAY.warn) : OVERLAY.body;
  if (roi.state === 'locked') {
    ctx.beginPath();
    ctx.arc(x, y, r * w, 0, Math.PI * 2);
    ctx.stroke();
    if (roi.handsOn === false) {
      ctx.fillStyle = 'rgba(255,69,58,0.18)';
      ctx.fill();
    }
  }
  ctx.setLineDash([]);
}
