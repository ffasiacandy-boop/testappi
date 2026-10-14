// One Euro filter: strong smoothing when still (no jitter), little lag when moving fast.
export class OneEuro {
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.reset();
  }
  reset() { this.tPrev = null; this.xHat = 0; this.dxHat = 0; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.tPrev === null) { this.tPrev = t; this.xHat = x; this.dxHat = 0; return x; }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const dx = (x - this.xHat) / dt;
    this.dxHat += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dxHat);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxHat);
    this.xHat += OneEuro.alpha(cutoff, dt) * (x - this.xHat);
    return this.xHat;
  }
}
