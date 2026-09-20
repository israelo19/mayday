// The WASM fileset is ~11 MB and the phone fetches it over the LAN from the QR address, so a
// dropped request is an ordinary event, not an exceptional one. It used to be memoised as a
// rejected promise, which meant one bad fetch blinded the camera for the life of the page and
// left a reload as the only way back. These tests pin the retry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const forVisionTasks = vi.fn();
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: (...args: unknown[]) => forVisionTasks(...args) },
  PoseLandmarker: { createFromOptions: vi.fn() },
}));

describe('loadVisionFileset', () => {
  beforeEach(() => {
    vi.resetModules();
    forVisionTasks.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('shares one load between callers while it is working', async () => {
    const fileset = { ok: true };
    forVisionTasks.mockResolvedValue(fileset);
    const { loadVisionFileset } = await import('./pose');

    const [a, b] = await Promise.all([loadVisionFileset(), loadVisionFileset()]);

    expect(a).toBe(fileset);
    expect(b).toBe(fileset);
    expect(forVisionTasks).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load, so the next call refetches instead of replaying the rejection', async () => {
    forVisionTasks.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ok: true });
    const { loadVisionFileset } = await import('./pose');

    await expect(loadVisionFileset()).rejects.toThrow('network');
    await expect(loadVisionFileset()).resolves.toEqual({ ok: true });
    expect(forVisionTasks).toHaveBeenCalledTimes(2);
  });

  it('keeps refetching across repeated failures rather than latching off', async () => {
    forVisionTasks.mockRejectedValue(new Error('network'));
    const { loadVisionFileset } = await import('./pose');

    await expect(loadVisionFileset()).rejects.toThrow('network');
    await expect(loadVisionFileset()).rejects.toThrow('network');
    await expect(loadVisionFileset()).rejects.toThrow('network');
    expect(forVisionTasks).toHaveBeenCalledTimes(3);
  });
});
