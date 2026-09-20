// Video sources, docs/03. The live camera (rear on phones, whatever exists on a laptop) or a
// recorded clip for the replay harness. Frames never leave the <video> element; nothing here
// records or uploads. Owned by P1.

export type Facing = 'environment' | 'user' | 'unknown';

export type CameraHandle = {
  kind: 'camera' | 'replay';
  facing: Facing;
  width: number;
  height: number;
  stop(): void;
};

/**
 * Call from inside the I NEED HELP tap, before React paints the live screen. CameraView's
 * getUserMedia is video-only and runs in useEffect (outside the gesture), so iOS would
 * otherwise prompt for the microphone only after the first card is tapped. One combined
 * prompt here grants both; the tracks stop so CameraView and SpeechRecognition can reopen
 * them without a second sheet.
 */
export async function primeMediaPermissions(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Permission denied or no devices: the live screen already has camera-off and voice-off paths.
  }
}

async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return;
  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The video source could not be loaded.'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export async function openCamera(
  video: HTMLVideoElement,
  prefer: 'environment' | 'user' = 'environment',
  /** Fires the moment a stream is granted, so the caller can stop saying "waiting for permission". */
  onGranted?: () => void,
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
  onGranted?.();

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};
  const facing: Facing = settings.facingMode === 'user' ? 'user' : settings.facingMode === 'environment' ? 'environment' : 'unknown';

  video.removeAttribute('src');
  video.loop = false;
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  await waitForMetadata(video);
  await video.play();

  return {
    kind: 'camera',
    facing,
    width: video.videoWidth,
    height: video.videoHeight,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** Replay harness: a recorded clip runs through the exact same pipeline as the camera. */
export async function openReplay(video: HTMLVideoElement, url: string): Promise<CameraHandle> {
  video.srcObject = null;
  video.src = url;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  await waitForMetadata(video);
  await video.play();
  return {
    kind: 'replay',
    facing: 'unknown',
    width: video.videoWidth,
    height: video.videoHeight,
    stop: () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}
