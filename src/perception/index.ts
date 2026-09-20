// Perception module, docs/03. Runs entirely on-device. Emits PerceptionFacts (measurements,
// never advice) and knows nothing about protocols. Frames live in the <video> element and
// are discarded after each detection; only derived numbers persist. No network calls, ever
// (scripts/check-ai-boundaries.mjs enforces it). Owned by P1 (docs/07).
//
// Pipeline per frame:
//   video frame -> PoseLandmarker -> shoulders -> EMA -> PeakDetector -> rate / active / recoil
//                                 -> confidence -> ConfidenceGate -> blind (metrics nulled)
//   in 'pose+hands' mode:  -> HandLandmarker -> palm centres -> RoiTracker -> handsOn / handsOffMs
import type { HandLandmarker, NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PerceptionFacts, SceneObservation } from '../types';
import { openCamera, openReplay, type CameraHandle, type Facing } from './camera';
import { ChokingGestureDetector, RoiTracker, loadHandLandmarker, toHands, type Hand, type Roi } from './hands';
import { LumaSampler } from './luma';
import { drawHands, drawPeople, drawPose, drawRoi } from './overlay';
import { loadPoseLandmarker, type Delegate } from './pose';
import { SceneTracker } from './scene';
import {
  ConfidenceGate,
  DEFAULT_TUNING,
  Ema,
  PeakDetector,
  PersonDownDetector,
  TimeSeries,
  cameraGuidance,
  clampTuning,
  isActive,
  meanRecoil,
  pickRescuer,
  rateByCount,
  rateFromPeaks,
  shoulderConfidence,
  shoulderMidX,
  shoulderMidY,
  shoulderSpan,
  type Sample,
  type Tuning,
} from './signal';

export type { Hand, Roi, RoiState } from './hands';
export type { Facing } from './camera';
export type { Sample, Tuning } from './signal';
export { DEFAULT_TUNING, TUNING_RANGES, GUIDANCE } from './signal';
export { primeMediaPermissions } from './camera';

/**
 * `awaiting-permission` is the stretch where getUserMedia has been called and the browser has
 * not answered, which on a phone is a modal sheet the person is reading. It used to be folded
 * into `starting-camera`, so the screen could not tell a 17 MB download from an unanswered
 * prompt and counted its deadlines down through both.
 */
export type PerceptionStatus =
  | 'idle'
  | 'loading-model'
  | 'awaiting-permission'
  | 'starting-camera'
  | 'running'
  | 'stopped'
  | 'error';
export type PerceptionMode = 'pose' | 'pose+hands';
export type StartOptions = {
  /** Run a recorded clip instead of the camera (replay harness). */
  replayUrl?: string;
};

export interface PerceptionDebug {
  /** Smoothed shoulder-y samples in the trailing windowMs. */
  series(windowMs: number): readonly Sample[];
  /** Confirmed compression peak timestamps (same clock as series). */
  peaks(): readonly number[];
  fps(): number;
  status(): PerceptionStatus;
  error(): string | null;
  raw(): number | null;
  facing(): Facing;
  delegate(): Delegate | null;
  frameSize(): { width: number; height: number } | null;
  source(): 'camera' | 'replay' | null;
  mode(): PerceptionMode;
  handsReady(): boolean;
  blind(): boolean;
  /** Instantaneous shoulder confidence before the gate. */
  confidenceRaw(): number;
  /** docs/03's literal 10 s count x 6, for comparing against the median-interval rate. */
  rateByCount(): number | null;
  luma(): number | null;
  hands(): readonly Hand[];
  chokingGesture(): boolean;
  tuning(): Tuning;
  setTuning(t: Partial<Tuning>): void;
  lastFacts(): PerceptionFacts | null;
}

/** The seam between P1 and P4 (docs/07). P2's FakePerception implements the same interface. */
export interface Perception {
  start(video: HTMLVideoElement, overlay?: HTMLCanvasElement, opts?: StartOptions): Promise<void>;
  stop(): void;
  /** Returns an unsubscribe function. Called once per processed frame. */
  subscribe(cb: (f: PerceptionFacts) => void): () => void;
  /** "Move the phone closer", "I can't see you", or null when the view is good. Never medical. */
  getCameraGuidance(): string | null;
  /** Hands are only tracked in bleeding states, for performance. */
  setMode(mode: PerceptionMode): void;
  /** Start watching for the hands to settle on the wound (bleeding.pressure entry). */
  lockRoi(): void;
  unlockRoi(): void;
  /** Region state for the orchestrator ('failed' -> announce verbal-only) and for drawing. */
  roi(): Roi;
  /** One JPEG frame as base64 (no data-URL prefix) for the flagged vision describer. Only src/ai may consume it. */
  captureFrame(maxPx?: number): string | null;
  readonly debug: PerceptionDebug;
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: DOMHighResTimeStamp, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function createPerception(opts: { tuning?: Partial<Tuning> } = {}): Perception {
  return new PerceptionImpl(clampTuning({ ...DEFAULT_TUNING, ...opts.tuning }));
}

class PerceptionImpl implements Perception {
  private video: VideoWithRvfc | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private source: CameraHandle | null = null;

  private poseLoad: ReturnType<typeof loadPoseLandmarker> | null = null;
  private pose: PoseLandmarker | null = null;
  private handsLoad: ReturnType<typeof loadHandLandmarker> | null = null;
  private handsModel: HandLandmarker | null = null;
  private delegateUsed: Delegate | null = null;

  private generation = 0; // bumps on every start/stop so a superseded start() aborts cleanly
  private running = false;
  private usingRvfc = false;
  private frameHandle = 0;
  private lastVideoTime = -1;
  private lastTs = 0;
  private frameIndex = 0;
  private frameTimes: number[] = [];

  private statusValue: PerceptionStatus = 'idle';
  private errorValue: string | null = null;
  private modeValue: PerceptionMode = 'pose';

  private tuningValue: Tuning;
  private ema: Ema;
  private detector: PeakDetector;
  private readonly series = new TimeSeries(30_000);
  private readonly gate = new ConfidenceGate();
  private readonly luma = new LumaSampler();
  private readonly roiTracker = new RoiTracker();
  private readonly choking = new ChokingGestureDetector();
  private readonly personDown = new PersonDownDetector();
  private personDownNow = false;
  private readonly sceneTracker = new SceneTracker();
  private scene: SceneObservation = { people: [] };
  private readonly subs = new Set<(f: PerceptionFacts) => void>();

  private lastPose: readonly NormalizedLandmark[] | null = null;
  private lastHands: Hand[] = [];
  private lastRoi: Roi;
  private rawY: number | null = null;
  // Where the measured shoulders were last frame, so pickRescuer keeps following the same person.
  private lastMid: { x: number; y: number } | null = null;
  private rawConfidence = 0;
  private blindNow = false;
  private shouldersSeenAt: number | null = null;
  private span: number | null = null;
  private chokingNow = false;
  private guidance: string | null = null;
  private facts: PerceptionFacts | null = null;

  constructor(tuning: Tuning) {
    this.tuningValue = tuning;
    this.ema = new Ema(tuning.emaAlpha);
    this.detector = new PeakDetector(tuning.prominence, tuning.refractoryMs);
    this.lastRoi = this.roiTracker.snapshot();
  }

  readonly debug: PerceptionDebug = {
    series: (windowMs) => this.series.window(windowMs),
    peaks: () => this.detector.peakTimes(),
    fps: () => this.frameTimes.length,
    status: () => this.statusValue,
    error: () => this.errorValue,
    raw: () => this.rawY,
    facing: () => this.source?.facing ?? 'unknown',
    delegate: () => this.delegateUsed,
    frameSize: () => (this.source ? { width: this.source.width, height: this.source.height } : null),
    source: () => this.source?.kind ?? null,
    mode: () => this.modeValue,
    handsReady: () => this.handsModel !== null,
    blind: () => this.blindNow,
    confidenceRaw: () => this.rawConfidence,
    rateByCount: () => (this.blindNow ? null : rateByCount(this.detector.peakTimes(), performance.now())),
    luma: () => this.luma.current(),
    hands: () => this.lastHands,
    chokingGesture: () => this.chokingNow,
    tuning: () => this.tuningValue,
    setTuning: (t) => this.applyTuning(t),
    lastFacts: () => this.facts,
  };

  // ---- lifecycle -------------------------------------------------------------------

  async start(video: HTMLVideoElement, overlay?: HTMLCanvasElement, opts: StartOptions = {}): Promise<void> {
    const gen = ++this.generation;
    this.teardown();
    this.video = video;
    this.overlay = overlay ?? null;
    this.ctx2d = null;
    this.errorValue = null;
    this.resetSignal();
    try {
      this.statusValue = 'loading-model';
      // Same rule as loadVisionFileset: a failed load is forgotten, so a retry refetches
      // instead of replaying the old rejection forever.
      this.poseLoad ??= loadPoseLandmarker().catch((err: unknown) => {
        this.poseLoad = null;
        throw err;
      });
      const { landmarker, delegate } = await this.poseLoad;
      if (gen !== this.generation) return; // superseded by stop() or another start()
      this.pose = landmarker;
      this.delegateUsed = delegate;
      if (this.modeValue === 'pose+hands') await this.ensureHands();
      if (gen !== this.generation) return;

      // A replay needs no grant; the live camera is unanswered until getUserMedia resolves.
      this.statusValue = opts.replayUrl ? 'starting-camera' : 'awaiting-permission';
      const source = opts.replayUrl
        ? await openReplay(video, opts.replayUrl)
        : await openCamera(video, 'environment', () => {
            if (gen === this.generation) this.statusValue = 'starting-camera';
          });
      if (gen !== this.generation) {
        source.stop();
        return;
      }
      this.source = source;
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
    return this.guidance;
  }

  setMode(mode: PerceptionMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    if (mode === 'pose+hands') {
      void this.ensureHands().catch((err: unknown) => {
        console.warn('[perception] hand model unavailable, staying in pose mode', err);
        this.modeValue = 'pose';
      });
    } else {
      this.lastHands = [];
      this.roiTracker.unlock();
      this.lastRoi = this.roiTracker.snapshot();
    }
  }

  lockRoi(): void {
    if (this.modeValue !== 'pose+hands') this.setMode('pose+hands');
    this.roiTracker.lock(performance.now());
    this.lastRoi = this.roiTracker.snapshot();
  }

  unlockRoi(): void {
    this.roiTracker.unlock();
    this.lastRoi = this.roiTracker.snapshot();
  }

  roi(): Roi {
    return this.lastRoi;
  }

  captureFrame(maxPx = 640): string | null {
    const video = this.video;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
    const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  // ---- internals -------------------------------------------------------------------

  private applyTuning(t: Partial<Tuning>): void {
    this.tuningValue = clampTuning({ ...this.tuningValue, ...t });
    this.ema.alpha = this.tuningValue.emaAlpha;
    this.detector.prominence = this.tuningValue.prominence;
    this.detector.refractoryMs = this.tuningValue.refractoryMs;
  }

  private resetSignal(): void {
    this.ema.reset();
    this.detector.reset();
    this.series.clear();
    this.gate.reset();
    this.blindNow = false;
    this.shouldersSeenAt = null;
    this.span = null;
    this.rawY = null;
    this.lastMid = null;
    this.rawConfidence = 0;
    this.lastPose = null;
    this.lastHands = [];
    this.guidance = null;
    this.personDownNow = false;
    this.personDown.reset();
    this.sceneTracker.reset();
    this.scene = { people: [] };
    this.frameIndex = 0;
    this.frameTimes = [];
  }

  private async ensureHands(): Promise<void> {
    if (this.handsModel) return;
    this.handsLoad ??= loadHandLandmarker().catch((err: unknown) => {
      this.handsLoad = null;
      throw err;
    });
    const { landmarker } = await this.handsLoad;
    this.handsModel = landmarker;
  }

  private teardown(): void {
    this.running = false;
    if (this.video && this.frameHandle) {
      if (this.usingRvfc) this.video.cancelVideoFrameCallback?.(this.frameHandle);
      else cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = 0;
    this.source?.stop();
    this.source = null;
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
    const pose = this.pose;
    if (!this.running || !video || !pose) return;
    if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      const now = performance.now();
      // MediaPipe VIDEO mode needs strictly increasing integer-ish ms timestamps.
      let ts = Math.round(now);
      if (ts <= this.lastTs) ts = this.lastTs + 1;
      this.lastTs = ts;
      this.frameIndex++;
      this.frameTimes.push(now);
      while (this.frameTimes.length > 0 && this.frameTimes[0] < now - 1000) this.frameTimes.shift();

      const withHands = this.modeValue === 'pose+hands' && this.handsModel !== null;
      // With both models running, the pose runs on every other frame to keep the hands
      // responsive: the bleeding loop cares about hands, the confidence gate can wait a frame.
      const runPose = !withHands || this.frameIndex % 2 === 0;
      try {
        if (runPose) {
          pose.detectForVideo(video, ts, (result) => {
            this.scene = this.sceneTracker.update(result.landmarks, now);
            this.onPose(pickRescuer(result.landmarks, this.lastMid), now);
          });
        }
        if (withHands && this.handsModel) {
          this.onHands(toHands(this.handsModel.detectForVideo(video, ts)), now);
        }
      } catch (err) {
        console.warn('[perception] detection failed on a frame', err);
      }
      this.luma.sample(video, now);
      this.guidance = cameraGuidance({ now, shouldersSeenAt: this.shouldersSeenAt, span: this.span, luma: this.luma.current() });
      this.draw();
      this.emit(now);
    }
    this.scheduleFrame();
  }

  private onPose(lm: NormalizedLandmark[] | undefined, now: number): void {
    this.lastPose = lm ?? null;
    const confidence = lm ? shoulderConfidence(lm) : 0;
    this.rawConfidence = confidence;
    const { blind } = this.gate.update(confidence, now);
    if (blind && !this.blindNow) {
      // Entering blind mode: forget the running extreme so a stale half-cycle cannot
      // produce a phantom peak when sight returns.
      this.detector.reset();
      this.ema.reset();
    }
    this.blindNow = blind;
    this.personDownNow = this.personDown.update(lm ?? null, confidence >= this.gate.threshold, now);

    if (lm && confidence >= this.gate.threshold) {
      this.shouldersSeenAt = now;
      this.span = shoulderSpan(lm);
      const y = shoulderMidY(lm);
      this.rawY = y;
      this.lastMid = { x: shoulderMidX(lm), y };
      if (!blind) {
        const s = this.ema.push(y);
        this.series.push(now, s);
        this.detector.push(now, s);
      }
    } else {
      this.rawY = null;
      this.lastMid = null;
      if (!lm) this.span = null;
    }
  }

  private onHands(hands: Hand[], now: number): void {
    this.lastHands = hands;
    this.lastRoi = this.roiTracker.update(hands, now);
    const lm = this.lastPose;
    const neck =
      lm && this.rawConfidence >= this.gate.threshold
        ? { x: shoulderMidX(lm), y: shoulderMidY(lm) - 0.45 * shoulderSpan(lm), span: shoulderSpan(lm) }
        : null;
    this.chokingNow = this.choking.update(hands, neck, now);
  }

  private emit(now: number): void {
    const peaks = this.detector.peakTimes();
    const blind = this.blindNow;
    const locked = this.modeValue === 'pose+hands' && this.lastRoi.state === 'locked';
    const facts: PerceptionFacts = {
      t: Date.now(),
      poseConfidence: blind ? this.rawConfidence : Math.max(this.rawConfidence, this.gate.threshold),
      compressionRate: blind ? null : rateFromPeaks(peaks, now),
      compressionActive: blind ? false : isActive(peaks, now),
      recoilRatio: blind ? null : meanRecoil(this.detector.peakList(), this.detector.troughList(), now),
      handsOnRegion: locked ? this.lastRoi.handsOn : null,
      handsOffMs: locked ? this.lastRoi.handsOffMs : null,
      sceneHint: this.personDownNow ? 'person_down' : null,
      scene: this.scene,
    };
    this.facts = facts;
    for (const cb of this.subs) cb(facts);
  }

  private draw(): void {
    const canvas = this.overlay;
    const video = this.video;
    if (!canvas || !video) return;
    if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = (this.ctx2d ??= canvas.getContext('2d'));
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    drawPeople(ctx, this.scene, w, h);
    if (this.lastPose) drawPose(ctx, this.lastPose, w, h, this.blindNow);
    if (this.modeValue === 'pose+hands') {
      drawRoi(ctx, this.lastRoi, w, h);
      drawHands(ctx, this.lastHands, w, h, this.lastRoi);
    }
  }
}
