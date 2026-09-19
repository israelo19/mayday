// Live scrolling waveform of the smoothed shoulder-y signal. Plain canvas, no chart
// library. This is the M0 deliverable and also a pitch-deck figure. Owned by P1.
import { useEffect, useRef } from 'react';
import type { Sample } from '../perception/signal';

type Props = {
  /** Called every animation frame; returns the samples to draw (trailing window). */
  source: () => readonly Sample[];
  windowMs?: number;
  height?: number;
  /** Optional peak timestamps to mark (M1). */
  peaks?: () => readonly number[];
};

export function Waveform({ source, windowMs = 10_000, height = 160, peaks }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 300;
      const cssH = height;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, cssW, cssH);

      const samples = source();
      const tEnd = samples.length ? samples[samples.length - 1].t : performance.now();
      const tStart = tEnd - windowMs;
      const xOf = (t: number) => ((t - tStart) / windowMs) * cssW;

      // one vertical grid line per second
      ctx.strokeStyle = '#1f1f1f';
      ctx.lineWidth = 1;
      for (let t = Math.ceil(tStart / 1000) * 1000; t <= tEnd; t += 1000) {
        const x = xOf(t);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
      }

      if (samples.length < 2) {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '14px system-ui';
        ctx.fillText('waiting for a pose', 12, 24);
        return;
      }

      let min = Infinity;
      let max = -Infinity;
      for (const s of samples) {
        if (s.y < min) min = s.y;
        if (s.y > max) max = s.y;
      }
      const pad = Math.max((max - min) * 0.15, 0.004);
      min -= pad;
      max += pad;
      // Larger shoulder-y means the chest is pushed down; draw pushes as upward peaks.
      const yOf = (y: number) => cssH - ((y - min) / (max - min)) * cssH;

      ctx.strokeStyle = '#34c759';
      ctx.lineWidth = 2;
      ctx.beginPath();
      samples.forEach((s, i) => {
        const x = xOf(s.t);
        const y = yOf(s.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (peaks) {
        ctx.fillStyle = '#ff3b30';
        for (const t of peaks()) {
          if (t < tStart) continue;
          const s = nearest(samples, t);
          if (!s) continue;
          ctx.beginPath();
          ctx.arc(xOf(s.t), yOf(s.y), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const last = samples[samples.length - 1];
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(xOf(last.t), yOf(last.y), 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9aa0a6';
      ctx.font = '12px system-ui';
      ctx.fillText(`shoulder y (smoothed), ${(windowMs / 1000).toFixed(0)} s, pushes point up`, 8, cssH - 8);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [source, windowMs, height, peaks]);

  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 8 }} />;
}

function nearest(samples: readonly Sample[], t: number): Sample | null {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return samples[lo] ?? null;
}
