// Camera preview with the perception overlay on top. Perception owns the frame loop and
// draws the overlay; this component provides the elements, keeps the box at the video's
// real aspect ratio (portrait on phones), and hosts HUD children that are never mirrored.
// Owned by P1. P4 embeds this in the COACH screen with a smaller maxHeight.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Perception } from '../../src/perception';

type Props = {
  perception: Perception;
  /** Mirror only for a front camera (docs/03). */
  mirror: boolean;
  /** Replay harness: run this clip instead of the camera. */
  replayUrl?: string;
  /** Cap the preview height; the video is cover-cropped and the overlay crops with it. */
  maxHeight?: string;
  onError?: (err: unknown) => void;
  children?: ReactNode;
};

export function CameraView({ perception, mirror, replayUrl, maxHeight = '48vh', onError, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState(4 / 3);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let active = true;
    const onMeta = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) setAspect(video.videoWidth / video.videoHeight);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('resize', onMeta);
    perception.start(video, canvas, replayUrl ? { replayUrl } : undefined).catch((err: unknown) => {
      if (active) onError?.(err);
    });
    return () => {
      active = false;
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('resize', onMeta);
      perception.stop();
    };
  }, [perception, replayUrl, onError]);

  return (
    <div className="cam" style={{ aspectRatio: String(aspect), maxHeight }}>
      <div className="cam-media" style={{ transform: mirror ? 'scaleX(-1)' : undefined }}>
        <video ref={videoRef} muted playsInline autoPlay />
        <canvas ref={canvasRef} />
      </div>
      <div className="cam-hud">{children}</div>
    </div>
  );
}
