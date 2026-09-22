import { afterEach, describe, expect, it, vi } from 'vitest';
import { openCamera, primeMediaPermissions } from './camera';

describe('primeMediaPermissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks for camera and microphone in the launch tap, then releases the stream', async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    const getUserMedia = vi.fn(async () => ({ getTracks: () => tracks }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    await primeMediaPermissions();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
  });

  it('does nothing when the camera API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(primeMediaPermissions()).resolves.toBeUndefined();
  });
});

/**
 * The camera preview and the permission sheet are two different waits and the screen has to
 * tell them apart: `onGranted` is the moment the sheet closes, so the eyes chip can stop
 * saying "Waiting for camera permission" without waiting for metadata and play() as well.
 */
describe('openCamera onGranted', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function fakeVideo() {
    return {
      readyState: 1,
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
    } as unknown as HTMLVideoElement;
  }

  function fakeStream() {
    const listeners = new Map<string, () => void>();
    const track = {
      kind: 'video',
      getSettings: () => ({ facingMode: 'environment' }),
      stop: vi.fn(),
      addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    return { stream, track, endTrack: () => listeners.get('ended')?.(), hasEndedListener: () => listeners.has('ended') };
  }

  it('fires once the stream is granted, before the video is playing', async () => {
    const video = fakeVideo();
    const getUserMedia = vi.fn(async () => fakeStream().stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const granted = vi.fn(() => {
      expect((video.play as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    });

    await openCamera(video, 'environment', { onGranted: granted });

    expect(granted).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('never fires when the camera is refused, so the screen keeps saying it is waiting', async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const granted = vi.fn();

    await expect(openCamera(fakeVideo(), 'environment', { onGranted: granted })).rejects.toThrow('denied');

    expect(granted).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(2); // the ideal constraints, then the plain fallback
  });

  it('fires once even when the first constraint set fails and the fallback succeeds', async () => {
    let call = 0;
    const getUserMedia = vi.fn(async () => {
      call++;
      if (call === 1) throw Object.assign(new Error('overconstrained'), { name: 'OverconstrainedError' });
      return fakeStream().stream;
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const granted = vi.fn();

    await openCamera(fakeVideo(), 'environment', { onGranted: granted });

    expect(granted).toHaveBeenCalledTimes(1);
  });
});

/**
 * Three ways a granted stream used to be mishandled: a track that ends under a running
 * session went unnoticed, a play() that failed left the tracks open, and a start() that lost
 * the race to a newer one still wrote its stream into the element and later nulled it.
 */
describe('openCamera stream lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function fakeVideo(over: Partial<{ play: () => Promise<void> }> = {}) {
    return {
      readyState: 1,
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
      play: vi.fn(over.play ?? (async () => {})),
    } as unknown as HTMLVideoElement;
  }

  function fakeStream() {
    const listeners = new Map<string, () => void>();
    const track = {
      kind: 'video',
      getSettings: () => ({ facingMode: 'environment' }),
      stop: vi.fn(),
      addEventListener: (name: string, fn: () => void) => listeners.set(name, fn),
      removeEventListener: (name: string) => listeners.delete(name),
    };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    return { stream, track, endTrack: () => listeners.get('ended')?.(), hasEndedListener: () => listeners.has('ended') };
  }

  it('reports a track that ends under a running session, and unhooks it on stop()', async () => {
    const s = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => s.stream) } });
    const ended = vi.fn();

    const handle = await openCamera(fakeVideo(), 'environment', { onEnded: ended });
    s.endTrack();
    expect(ended).toHaveBeenCalledTimes(1);

    handle.stop();
    expect(s.hasEndedListener()).toBe(false); // our own stop() is not the camera going away
    expect(s.track.stop).toHaveBeenCalledTimes(1);
  });

  it('releases the tracks when the element will not play the granted stream', async () => {
    const s = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => s.stream) } });
    const video = fakeVideo({ play: async () => { throw new Error('play() interrupted'); } });

    await expect(openCamera(video, 'environment', {})).rejects.toThrow('play() interrupted');

    expect(s.track.stop).toHaveBeenCalledTimes(1); // no camera light left on behind "Try again"
    expect(video.srcObject).toBeNull();
  });

  it('gives up a grant that a newer start() overtook, without touching the element', async () => {
    const s = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => s.stream) } });
    const video = fakeVideo();
    const current = { stream: 'the newer generation' };
    video.srcObject = current as unknown as MediaStream;

    await expect(openCamera(video, 'environment', { isCurrent: () => false })).rejects.toThrow('superseded');

    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBe(current);
    expect(video.play).not.toHaveBeenCalled();
  });

  it("stop() leaves the element alone when it already shows someone else's stream", async () => {
    const s = fakeStream();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => s.stream) } });
    const video = fakeVideo();

    const handle = await openCamera(video, 'environment', {});
    expect(video.srcObject).toBe(s.stream);
    const newer = { stream: 'the newer generation' } as unknown as MediaStream;
    video.srcObject = newer;
    handle.stop();

    expect(video.srcObject).toBe(newer);
    expect(s.track.stop).toHaveBeenCalledTimes(1);
  });
});
