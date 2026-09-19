// Mean frame luminance, sampled from a tiny canvas. Used only to explain why the pose is
// missing ("It's too dark"). Frames never leave the device. Owned by P1.

export class LumaSampler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private lastAt = -Infinity;
  private value: number | null = null;

  constructor(
    private readonly intervalMs = 500,
    private readonly size = 24,
  ) {}

  /** Returns the latest mean luminance 0..255, re-sampling at most every intervalMs. */
  sample(video: HTMLVideoElement, now: number): number | null {
    if (now - this.lastAt < this.intervalMs) return this.value;
    if (video.readyState < 2 || video.videoWidth === 0) return this.value;
    this.lastAt = now;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.size;
      this.canvas.height = Math.round((this.size * 3) / 4);
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return this.value;
    try {
      ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
      const data = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      this.value = Math.round(sum / (data.length / 4));
    } catch {
      this.value = null;
    }
    return this.value;
  }

  current(): number | null {
    return this.value;
  }
}
