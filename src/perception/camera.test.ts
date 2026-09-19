import { afterEach, describe, expect, it, vi } from 'vitest';
import { primeMediaPermissions } from './camera';

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
