// Perception module, docs/03. Runs entirely on-device. Emits PerceptionFacts (measurements,
// never advice) and knows nothing about protocols. Frames live in the <video> element and
// are discarded after each detection; only derived numbers persist. Owned by P1 (docs/07).
//
// M0: camera + pose landmarks + smoothed shoulder-y signal + confidence.
// M1 (P1): peak detection, compressionRate, compressionActive, recoilRatio, confidence gate.
// M2 (P1): getCameraGuidance. M3 (P1): hands, ROI, setMode/lockRoi. M4 hook: captureFrame.
import { DrawingUtils, PoseLandmarker, type NormalizedLandmark, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import type { PerceptionFacts } from '../types';
import { openCamera, type CameraHandle, type Facing } from './camera';
import { loadPoseLandmarker, type Delegate } from './pose';
import { Ema, LEFT_SHOULDER, RIGHT_SHOULDER, TimeSeries, shoulderConfidence, shoulderMidY, type Sample } from './signal';

export type PerceptionStatus = 'idle' | 'loading-model' | 'starting-camera' | 'running' | 'stopped' | 'error';
export type PerceptionMode = 'pose' | 'pose+hands';

export interface PerceptionDebug {
  /** Smoothed shoulder-y samples in the trailing windowMs. */
  series(windowMs: number): readonly Sample[];
  /** Detected compression peak timestamps (M1). */
  peaks(): readonly number[];
  fps(): number;
  status(): PerceptionStatus;
  error(): string | null;
  raw(): number | null;
  facing(): Facing;
  delegate(): Delegate | null;
  frameSize(): { width: number; height: number } | null;
}

/** The seam between P1 and P3 (docs/07). FakePerception implements the same interface. */
export interface Perception {
  start(video: HTMLVideoElement, overlay?: HTMLCanvasElement): Promise<void>;
  stop(): void;
  /** Returns an unsubscribe function. Called once per processed frame. */
  subscribe(cb: (f: PerceptionFacts) => void): () => void;
  /** "Move the phone closer", "I can't see the patient", or null when the view is good. */
  getCameraGuidance(): string | null;
  /** Hands are only tracked in bleeding states, for performance. */
  setMode(mode: PerceptionMode): void;
  lockRoi(): void;
  unlockRoi(): void;
  /** One JPEG frame as base64 for the flagged vision describer. Only src/ai may consume it. */
  captureFrame(maxPx?: number): string | null;
  readonly debug: PerceptionDebug;
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: DOMHighResTimeStamp, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function createPerception(opts: { emaAlpha?: number } = {}): Perception {
  return new PerceptionImpl(opts.emaAlpha ?? 0.3);
}

class PerceptionImpl implements Perception {
  private video: VideoWithRvfc | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private drawer: DrawingUtils | null = null;
  private camera: CameraHandle | null = null;
  private landmarkerPromise: ReturnType<typeof loadPoseLandmarker> | null = null;
  private landmarker: PoseLandmarker | null = null;
  private delegateUsed: Delegate | null = null;

  private generation = 0; // bumps on every start/stop so a superseded start() aborts cleanly
  private running = false;
  private usingRvfc = false;
  private frameHandle = 0;
  private lastVideoTime = -1;
  private lastTs = 0;

  private statusValue: PerceptionStatus = 'idle';
  private errorValue: string | null = null;
  private rawY: number | null = null;
  private readonly ema: Ema;
  private readonly series = new TimeSeries(30_000);
  private readonly subs = new Set<(f: PerceptionFacts) => void>();
  private frameTimes: number[] = [];

  constructor(alpha: number) {
    this.ema = new Ema(alpha);
  }

  readonly debug: PerceptionDebug = {
    series: (windowMs) => this.series.window(windowMs),
    peaks: () => [],
    fps: () => this.frameTimes.length,
    status: () => this.statusValue,
    error: () => this.errorValue,
    raw: () => this.rawY,
    facing: () => this.camera?.facing ?? 'unknown',
    delegate: () => this.delegateUsed,
    frameSize: () => (this.camera ? { width: this.camera.width, height: this.camera.height } : null),
  };

  async start(video: HTMLVideoElement, overlay?: HTMLCanvasElement): Promise<void> {
    const gen = ++this.generation;
    this.teardown();
    this.video = video;
    this.overlay = overlay ?? null;
    this.ctx2d = null;
    this.drawer = null;
    this.errorValue = null;
    try {
      this.statusValue = 'loading-model';
      this.landmarkerPromise ??= loadPoseLandmarker();
      const { landmarker, delegate } = await this.landmarkerPromise;
      if (gen !== this.generation) return; // superseded by stop() or another start()
      this.landmarker = landmarker;
      this.delegateUsed = delegate;

      this.statusValue = 'starting-camera';
      const camera = await openCamera(video);
      if (gen !== this.generation) {
        camera.stop();
        return;
      }
      this.camera = camera;
      this.running = true;
      this.lastVideoTime = -1;
      this.statusValue = 'running';
      this.scheduleFrame();
    } catch (err) {
      if (gen !== this.generation) return;
      this.statusValue = 'error';
      this.errorValue = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  stop(): void {
    this.generation++;
    this.teardown();
    this.statusValue = 'stopped';
  }

  subscribe(cb: (f: PerceptionFacts) => void): () => void {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }

  getCameraGuidance(): string | null {
    return null; // M2, P1: docs/03 "Camera guidance"
  }

  setMode(_mode: PerceptionMode): void {
    // M3, P1: start/stop the HandLandmarker
  }

  lockRoi(): void {
    // M3, P1
  }

  unlockRoi(): void {
    // M3, P1
  }

  captureFrame(_maxPx?: number): string | null {
    return null; // M4 hook, P1. Feature-flagged consumer lives in src/ai.
  }

  private teardown(): void {
    this.running = false;
    if (this.video && this.frameHandle) {
      if (this.usingRvfc) this.video.cancelVideoFrameCallback?.(this.frameHandle);
      else cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = 0;
    this.camera?.stop();
    this.camera = null;
    if (this.overlay && this.ctx2d) this.ctx2d.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private scheduleFrame(): void {
    const video = this.video;
    if (!video || !this.running) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.usingRvfc = true;
      this.frameHandle = video.requestVideoFrameCallback(() => this.onFrame());
    } else {
      this.usingRvfc = false;
      this.frameHandle = requestAnimationFrame(() => this.onFrame());
    }
  }

  private onFrame(): void {
    const video = this.video;
    const landmarker = this.landmarker;
    if (!this.running || !video || !landmarker) return;
    if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const now = performance.now();
      // MediaPipe VIDEO mode needs strictly increasing integer-ish ms timestamps.
      let ts = Math.round(now);
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;
      try {
        landmarker.detectForVideo(video, ts, (result) => this.handleResult(result, now));
      } catch (err) {
        console.warn('[perception] detectForVideo failed', err);
      }
    }
    this.scheduleFrame();
  }

  private handleResult(result: PoseLandmarkerResult, now: number): void {
    this.frameTimes.push(now);
    while (this.frameTimes.length > 0 && this.frameTimes[0] < now - 1000) this.frameTimes.shift();

    const lm: NormalizedLandmark[] | undefined = result.landmarks[0];
    let confidence = 0;
    if (lm) {
      confidence = shoulderConfidence(lm);
      const y = shoulderMidY(lm);
      this.rawY = y;
      this.series.push(now, this.ema.push(y));
    } else {
      this.rawY = null;
    }
    this.draw(lm);

    const facts: PerceptionFacts = {
      t: Date.now(),
      poseConfidence: confidence,
      compressionRate: null, // M1
      compressionActive: false, // M1
      recoilRatio: null, // M1
      handsOnRegion: null, // M3
      handsOffMs: null, // M3
    };
    for (const cb of this.subs) cb(facts);
  }

  private draw(lm: NormalizedLandmark[] | undefined): void {
    const canvas = this.overlay;
    const video = this.video;
    if (!canvas || !video) return;
    if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = (this.ctx2d ??= canvas.getContext('2d'));
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!lm) return;

    const drawer = (this.drawer ??= new DrawingUtils(ctx));
    drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: 'rgba(255,255,255,0.55)', lineWidth: 2 });
    drawer.drawLandmarks(lm, { color: '#ffffff', fillColor: '#ffffff', radius: 2, lineWidth: 1 });

    // The signal source: both shoulders and their midpoint, in red.
    const w = canvas.width;
    const h = canvas.height;
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 3;
    for (const i of [LEFT_SHOULDER, RIGHT_SHOULDER]) {
      const p = lm[i];
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    const mx = ((lm[LEFT_SHOULDER].x + lm[RIGHT_SHOULDER].x) / 2) * w;
    const my = shoulderMidY(lm) * h;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
