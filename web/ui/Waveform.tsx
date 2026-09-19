// Live scrolling trace of the smoothed shoulder-y signal with confirmed peaks marked.
// Plain canvas, no chart library. The M0 deliverable and a pitch-deck figure. Owned by P1.
import { useEffect, useRef } from 'react';
import type { Sample } from '../../src/perception/signal';

type Props = {
  /** Called every animation frame; returns the samples to draw (trailing window). */
  source: () => readonly Sample[];
  /** Confirmed peak timestamps on the same clock as the samples. */
  peaks?: () => readonly number[];
  windowMs?: number;
  height?: number;
  /** Replaces the caption, e.g. while blind. */
  note?: string;
};

const COLORS = {
  ground: '#0b0f12',
  grid: '#151b21',
  trace: '#7fe3c6',
  peak: '#7fe3c6',
  peakRing: '#0b0f12',
  now: '#ffffff',
  text: '#5f6a74',
  note: '#ffb454',
};

export function Waveform({ source, peaks, windowMs = 10_000, height = 170, note }: Props) {
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
      ctx.fillStyle = COLORS.ground;
      ctx.fillRect(0, 0, cssW, cssH);

      const samples = source();
      const tEnd = samples.length ? samples[samples.length - 1].t : performance.now();
      const tStart = tEnd - windowMs;
      const xOf = (t: number) => ((t - tStart) / windowMs) * cssW;

      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      for (let t = Math.ceil(tStart / 1000) * 1000; t <= tEnd; t += 1000) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
        ctx.stroke();
      }

      ctx.font = '12px system-ui, sans-serif';
      if (samples.length < 2) {
        ctx.fillStyle = COLORS.text;
        ctx.fillText(note ?? 'Waiting for a pose', 10, cssH - 10);
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
      const yOf = (y: number) => 8 + (cssH - 30 - 8) * (1 - (y - min) / (max - min));

      ctx.strokeStyle = COLORS.trace;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      samples.forEach((s, i) => {
        const x = xOf(s.t);
        const y = yOf(s.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (peaks) {
        for (const t of peaks()) {
          if (t < tStart || t > tEnd) continue;
          const s = nearest(samples, t);
          if (!s) continue;
          ctx.beginPath();
          ctx.arc(xOf(s.t), yOf(s.y), 4.5, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.peak;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = COLORS.peakRing;
          ctx.stroke();
        }
      }

      const last = samples[samples.length - 1];
      ctx.fillStyle = COLORS.now;
      ctx.beginPath();
      ctx.arc(xOf(last.t), yOf(last.y), 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = note ? COLORS.note : COLORS.text;
      ctx.fillText(note ?? `shoulders, last ${(windowMs / 1000).toFixed(0)} s, a push points up, dots are counted pushes`, 10, cssH - 10);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [source, peaks, windowMs, height, note]);

  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 10 }} />;
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
