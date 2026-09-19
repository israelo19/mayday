// The rhythm trace under the compression loop: the target compression wave scrolling
// toward a "now" line, beat ticks, and, when the coach screen passes it, the bystander's
// own shoulder signal and detected pushes drawn underneath for comparison. Plain canvas,
// same conventions as web/ui/Waveform.tsx (pushes point up). Owned by P4.
import { useEffect, useRef } from 'react';
import { beatPeriodMs, beatPhase, compressionDepth } from './beat';
import type { Judgement, RateBand } from './judge';

// =============================================================================
// Module Overview
// =============================================================================
// `RhythmTrace` draws every animation frame from the same clock as the figure. `LiveSource`
// is the structural seam for perception data: any `{ t, y }` series in `performance.now()`
// milliseconds works, so this file never imports from src/perception.

export type LiveSample = { t: number; y: number };

/** Readers for the bystander's live signal; both are polled each frame, so they must be cheap. */
export type LiveSource = {
  series?: () => readonly LiveSample[];
  peaks?: () => readonly number[];
};

type Props = {
  bpm: number;
  beatOriginMs: number;
  paused: boolean;
  judgement: Judgement;
  live?: LiveSource;
  windowMs?: number;
  height?: number;
};

/** Share of the window that is in the past; the rest shows the beats about to arrive. */
const PAST_SHARE = 0.72;
const COLORS = { target: '#34c759', targetFuture: 'rgba(52, 199, 89, 0.38)', you: '#f6f3ea', peak: '#ff3b30', now: '#ffffff', tick: '#1f2327', bg: '#0a0a0a', text: '#9aa0a6' } as const;

/** Color for the bystander's rate, matching the coaching bands. */
export function bandColor(band: RateBand): string {
  switch (band) {
    case 'ok':
      return '#34c759';
    case 'fast':
      return '#ffcc00';
    case 'low':
    case 'high':
      return '#ff3b30';
    case 'unknown':
      return '#9aa0a6';
  }
}

export function RhythmTrace({ bpm, beatOriginMs, paused, judgement, live, windowMs = 4_000, height = 96 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const judgementRef = useRef(judgement);
  judgementRef.current = judgement;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || paused) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 300;
      const h = height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, w, h);

      const now = performance.now();
      const tStart = now - windowMs * PAST_SHARE;
      const xOf = (t: number) => ((t - tStart) / windowMs) * w;
      const nowX = xOf(now);
      const top = 14;
      const bottom = h - 12;
      const yOfDepth = (d: number) => bottom - d * (bottom - top);

      drawTicks(ctx, tStart, tStart + windowMs, bpm, beatOriginMs, xOf, h);
      drawLive(ctx, live, tStart, now, xOf, top, bottom);
      drawTarget(ctx, w, nowX, tStart, windowMs, bpm, beatOriginMs, yOfDepth);

      ctx.strokeStyle = COLORS.now;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nowX, 0);
      ctx.lineTo(nowX, h);
      ctx.stroke();

      const j = judgementRef.current;
      const nowDepth = compressionDepth(beatPhase(now, bpm, beatOriginMs));
      ctx.fillStyle = j.active ? bandColor(j.rateBand) : COLORS.target;
      ctx.beginPath();
      ctx.arc(nowX, yOfDepth(nowDepth), 5, 0, Math.PI * 2);
      ctx.fill();

      drawLabels(ctx, w, bpm, j);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [bpm, beatOriginMs, paused, live, windowMs, height]);

  return <canvas ref={ref} className="gd-trace" style={{ height }} aria-label="Target compression rhythm" />;
}

/** One faint line per beat; the tick nearest the present is brighter. */
function drawTicks(ctx: CanvasRenderingContext2D, tStart: number, tEnd: number, bpm: number, origin: number, xOf: (t: number) => number, h: number) {
  const period = beatPeriodMs(bpm);
  const first = origin + Math.ceil((tStart - origin) / period) * period;
  ctx.lineWidth = 1;
  for (let t = first; t <= tEnd; t += period) {
    ctx.strokeStyle = COLORS.tick;
    const x = xOf(t);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

/** The target wave: solid where it has passed, dim where it is still to come. */
function drawTarget(ctx: CanvasRenderingContext2D, w: number, nowX: number, tStart: number, windowMs: number, bpm: number, origin: number, yOfDepth: (d: number) => number) {
  const tOf = (x: number) => tStart + (x / w) * windowMs;
  const stroke = (from: number, to: number, color: string, dash: number[]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    for (let x = from; x <= to; x += 2) {
      const y = yOfDepth(compressionDepth(beatPhase(tOf(x), bpm, origin)));
      if (x === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  stroke(0, nowX, COLORS.target, []);
  stroke(nowX, w, COLORS.targetFuture, [4, 4]);
}

/** The bystander's own signal, scaled to its own range in the window, with detected pushes marked. */
function drawLive(ctx: CanvasRenderingContext2D, live: LiveSource | undefined, tStart: number, now: number, xOf: (t: number) => number, top: number, bottom: number) {
  const samples = live?.series?.() ?? [];
  let first = 0;
  while (first < samples.length && samples[first].t < tStart) first++;
  const visible = samples.slice(first).filter((s) => s.t <= now);
  if (visible.length < 2) return;
  let min = Infinity;
  let max = -Infinity;
  for (const s of visible) {
    if (s.y < min) min = s.y;
    if (s.y > max) max = s.y;
  }
  // A flat signal still needs a range, and a little padding keeps the line off the edges.
  const pad = Math.max((max - min) * 0.15, 0.004);
  min -= pad;
  max += pad;
  // Larger shoulder-y means the chest is pushed down, drawn upward like the debug waveform.
  const yOf = (y: number) => bottom - ((y - min) / (max - min)) * (bottom - top);

  ctx.strokeStyle = COLORS.you;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  visible.forEach((s, i) => {
    if (i === 0) ctx.moveTo(xOf(s.t), yOf(s.y));
    else ctx.lineTo(xOf(s.t), yOf(s.y));
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  const peaks = live?.peaks?.() ?? [];
  ctx.fillStyle = COLORS.peak;
  for (const t of peaks) {
    if (t < tStart || t > now) continue;
    const s = nearest(visible, t);
    if (!s) continue;
    ctx.beginPath();
    ctx.arc(xOf(s.t), yOf(s.y), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLabels(ctx: CanvasRenderingContext2D, w: number, bpm: number, j: Judgement) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.fillText(`beat ${bpm} / min`, 8, 6);
  ctx.textAlign = 'right';
  if (!j.hasFacts) {
    ctx.textAlign = 'left';
    return;
  }
  if (!j.visible) {
    ctx.fillStyle = '#ffcc00';
    ctx.fillText('camera: no view', w - 8, 6);
  } else if (j.rate === null) {
    ctx.fillText(j.active ? 'you: measuring' : 'you: no pushes seen', w - 8, 6);
  } else {
    ctx.fillStyle = bandColor(j.rateBand);
    ctx.fillText(`you ${Math.round(j.rate)} / min`, w - 8, 6);
  }
  ctx.textAlign = 'left';
}

function nearest(samples: readonly LiveSample[], t: number): LiveSample | null {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return samples[lo] ?? null;
}
