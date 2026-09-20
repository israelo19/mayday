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
    const track = { kind: 'video', getSettings: () => ({ facingMode: 'environment' }), stop: vi.fn() };
    return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  }

  it('fires once the stream is granted, before the video is playing', async () => {
    const video = fakeVideo();
    const getUserMedia = vi.fn(async () => fakeStream());
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const granted = vi.fn(() => {
      expect((video.play as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    });

    await openCamera(video, 'environment', granted);

    expect(granted).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('never fires when the camera is refused, so the screen keeps saying it is waiting', async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const granted = vi.fn();

    await expect(openCamera(fakeVideo(), 'environment', granted)).rejects.toThrow('denied');

    expect(granted).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(2); // the ideal constraints, then the plain fallback
  });

  it('fires once even when the first constraint set fails and the fallback succeeds', async () => {
    let call = 0;
    const getUserMedia = vi.fn(async () => {
      call++;
      if (call === 1) throw Object.assign(new Error('overconstrained'), { name: 'OverconstrainedError' });
      return fakeStream();
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const granted = vi.fn();

    await openCamera(fakeVideo(), 'environment', granted);

    expect(granted).toHaveBeenCalledTimes(1);
  });
});
