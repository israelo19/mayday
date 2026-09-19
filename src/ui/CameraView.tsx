// Camera preview with the pose overlay canvas on top. The perception module owns the
// frame loop and draws the overlay; this component only provides the elements. Owned by P1.
import { useEffect, useRef } from 'react';
import type { Perception } from '../perception';

type Props = {
  perception: Perception;
  /** Mirror only for a front camera (docs/03). */
  mirror: boolean;
  onError?: (err: unknown) => void;
};

export function CameraView({ perception, mirror, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    let active = true;
    perception.start(video, canvas).catch((err: unknown) => {
      if (active) onError?.(err);
    });
    return () => {
      active = false;
      perception.stop();
    };
  }, [perception, onError]);

  const layer = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' } as const;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        background: '#000',
        borderRadius: 12,
        overflow: 'hidden',
        transform: mirror ? 'scaleX(-1)' : undefined,
      }}
    >
      <video ref={videoRef} muted playsInline autoPlay style={layer} />
      <canvas ref={canvasRef} style={layer} />
    </div>
  );
}
