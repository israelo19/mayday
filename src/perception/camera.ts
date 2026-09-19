// Camera wrapper, docs/03. Rear camera on phones, whatever exists on a laptop.
// Frames never leave the <video> element; nothing here records or uploads. Owned by P1.

export type Facing = 'environment' | 'user' | 'unknown';

export type CameraHandle = {
  stream: MediaStream;
  facing: Facing;
  width: number;
  height: number;
  stop(): void;
};

export async function openCamera(
  video: HTMLVideoElement,
  prefer: 'environment' | 'user' = 'environment',
): Promise<CameraHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API unavailable. Open the app over HTTPS (or localhost).');
  }
  const attempts: MediaStreamConstraints[] = [
    {
      video: { facingMode: { ideal: prefer }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    },
    { video: true, audio: false },
  ];
  let stream: MediaStream | null = null;
  let lastErr: unknown = null;
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!stream) throw lastErr instanceof Error ? lastErr : new Error('Camera unavailable');

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};
  const facing: Facing = settings.facingMode === 'user' ? 'user' : settings.facingMode === 'environment' ? 'environment' : 'unknown';

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) resolve();
    else video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
  await video.play();

  return {
    stream,
    facing,
    width: video.videoWidth,
    height: video.videoHeight,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
