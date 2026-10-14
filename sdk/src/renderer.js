// Draws the mirrored/cover-fitted camera frame and the garment on a single canvas.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.mirror = true; this.alpha = 0;
    this.cw = canvas.width; this.ch = canvas.height;
    this.ox = 0; this.oy = 0; this.dw = 1; this.dh = 1;
  }
  setMirror(m) { this.mirror = !!m; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) { this.canvas.width = w; this.canvas.height = h; }
    this.cw = w; this.ch = h;
  }

  layout(video) {
    this.resize();
    const s = Math.max(this.cw / video.videoWidth, this.ch / video.videoHeight);   // "cover"
    this.dw = video.videoWidth * s; this.dh = video.videoHeight * s;
    this.ox = (this.cw - this.dw) / 2; this.oy = (this.ch - this.dh) / 2;
  }

  /** normalized video coords -> canvas pixels (accounts for mirroring) */
  toCanvas(nx, ny) {
    return { x: this.ox + (this.mirror ? 1 - nx : nx) * this.dw, y: this.oy + ny * this.dh };
  }

  draw(video, adapter, show) {
    const { ctx } = this;
    ctx.save();
    if (this.mirror) { ctx.translate(this.cw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, this.ox, this.oy, this.dw, this.dh);
    ctx.restore();
    this.alpha += ((show ? 1 : 0) - this.alpha) * 0.2;
    if (adapter) adapter.draw(ctx, this.alpha);
  }
}
