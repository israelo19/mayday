// The frame loop itself, driven in node: MediaPipe is a fake that hands back whatever pose
// the test says, the camera is a fake stream on a fake <video>, and the frame callback is
// fired by hand. What these pin is that the loop never goes quiet on its own: a frame that
// throws still schedules the next one, a subscriber that throws starves nobody, and a
// camera track that ends is said out loud as an error, so "Try again" appears (principle 4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediapipe = vi.hoisted(() => ({
  detect: null as ((cb: (result: { landmarks: unknown[][] }) => void) => void) | null,
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) },
  PoseLandmarker: {
    POSE_CONNECTIONS: [] as { start: number; end: number }[], // overlay.ts reads it at import
    createFromOptions: vi.fn(async () => ({
      detectForVideo: (_video: unknown, _ts: number, cb: (result: { landmarks: unknown[][] }) => void) => {
        if (mediapipe.detect) mediapipe.detect(cb);
        else cb({ landmarks: [] });
      },
    })),
  },
  HandLandmarker: { createFromOptions: vi.fn() },
}));

function fakeVideo() {
  let frameCb: (() => void) | null = null;
  const video = {
    readyState: 2,
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    srcObject: null as unknown,
    muted: false,
    loop: true,
    playsInline: false,
    removeAttribute: vi.fn(),
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    play: vi.fn(async () => {}),
    requestVideoFrameCallback: vi.fn((cb: () => void) => {
      frameCb = cb;
      return 1;
    }),
    cancelVideoFrameCallback: vi.fn(() => {
      frameCb = null;
    }),
  };
  return {
    video: video as unknown as HTMLVideoElement,
    /** Advance the clip by one frame and run the loop once. */
    frame: () => {
      video.currentTime += 1 / 30;
      const cb = frameCb;
      frameCb = null;
      cb?.();
    },
    /** The callback the loop had pending, so a test can fire it late, after a stop(). */
    take: () => {
      const cb = frameCb;
      frameCb = null;
      return cb;
    },
    scheduled: () => frameCb !== null,
    cancelled: () => video.cancelVideoFrameCallback.mock.calls.length,
  };
}

function fakeCamera() {
  const listeners = new Map<string, () => void>();
  const track = {
    kind: 'video',
    getSettings: () => ({ facingMode: 'environment' }),
    stop: vi.fn(),
    addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  return { track, endTrack: () => listeners.get('ended')?.() };
}

describe('the perception frame loop', () => {
  beforeEach(() => {
    vi.resetModules();
    mediapipe.detect = null;
    // The luma sampler wants a canvas; one with no 2d context makes it answer null and move on.
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps scheduling frames and serving other subscribers when one subscriber throws', async () => {
    fakeCamera();
    const v = fakeVideo();
    const { createPerception } = await import('./index');
    const p = createPerception();
    await p.start(v.video);
    expect(p.debug.status()).toBe('running');

    const seen: number[] = [];
    p.subscribe(() => {
      throw new Error('a screen bug');
    });
    p.subscribe((f) => seen.push(f.t));

    v.frame();
    expect(seen.length).toBe(1); // the second subscriber still heard the frame
    expect(v.scheduled()).toBe(true); // and the loop asked for the next one
    v.frame();
    expect(seen.length).toBe(2);
    expect(p.debug.status()).toBe('running');
    p.stop();
  });

  it('schedules the next frame even when the frame fails after detection', async () => {
    fakeCamera();
    const v = fakeVideo();
    const { createPerception } = await import('./index');
    const p = createPerception();
    // An overlay whose 2d context throws while frames are drawn: draw() sits outside the
    // detection guard. Disarmed before stop(), which clears the same canvas and, unlike a
    // frame, is not what this test is about.
    let broken = true;
    const overlay = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: () => {
          if (broken) throw new Error('canvas gone');
        },
      }),
    } as unknown as HTMLCanvasElement;
    await p.start(v.video, overlay);
    const facts: unknown[] = [];
    p.subscribe((f) => facts.push(f));

    v.frame();
    expect(v.scheduled()).toBe(true); // used to be skipped: status 'running', no frames ever again
    expect(facts.length).toBe(0); // the frame itself was lost, honestly
    v.frame();
    expect(v.scheduled()).toBe(true);
    broken = false;
    const stale = v.take(); // the browser may still deliver the frame the loop had asked for
    p.stop();
    stale?.();
    expect(v.scheduled()).toBe(false); // a stopped loop is not resurrected by the guard
  });

  it('turns a camera track that ends into an error the screen can show, and stops the loop', async () => {
    const cam = fakeCamera();
    const v = fakeVideo();
    const { createPerception } = await import('./index');
    const p = createPerception();
    await p.start(v.video);
    v.frame();
    expect(p.debug.status()).toBe('running');

    cam.endTrack(); // another app took the camera, or the OS did

    expect(p.debug.status()).toBe('error');
    expect(p.debug.error()).toBe('Camera stopped');
    expect(cam.track.stop).toHaveBeenCalledTimes(1);
    expect(v.cancelled()).toBe(1);
    expect(p.debug.source()).toBeNull();
  });

  it('ignores a track from a generation that stop() already ended', async () => {
    const cam = fakeCamera();
    const v = fakeVideo();
    const { createPerception } = await import('./index');
    const p = createPerception();
    await p.start(v.video);
    p.stop();
    expect(p.debug.status()).toBe('stopped');
    cam.endTrack();
    expect(p.debug.status()).toBe('stopped'); // not rewritten as an error after the fact
  });
});
