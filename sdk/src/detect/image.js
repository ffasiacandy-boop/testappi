// Looks at the garment image itself: (1) removes a plain studio background so only the garment is overlaid,
// crops it tight, and (2) guesses the garment type from its silhouette (used when the page text gives no clue).
// All pixel work needs a CORS-readable image; for tainted (cross-origin, no CORS) images we skip it gracefully.
const MAX_SIDE = 900;
const cache = new Map();

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const attempt = (cors) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve({ img, tainted: !cors });
      img.onerror = () => (cors ? attempt(false) : reject(Object.assign(new Error('image'), { code: 'IMAGE' })));
      img.src = url;
    };
    attempt(true);
  });
}

function floodBackground(px, w, h) {
  // Background colour = average of the border pixels (must be fairly uniform, e.g. white/grey studio sweep).
  let r = 0, g = 0, b = 0, n = 0, maxDev = 0;
  const border = [];
  for (let x = 0; x < w; x++) { border.push(x, (h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { border.push(y * w, y * w + w - 1); }
  for (const i of border) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++; }
  r /= n; g /= n; b /= n;
  for (const i of border) maxDev = Math.max(maxDev, Math.abs(px[i * 4] - r) + Math.abs(px[i * 4 + 1] - g) + Math.abs(px[i * 4 + 2] - b));
  const dev = (i) => Math.abs(px[i * 4] - r) + Math.abs(px[i * 4 + 1] - g) + Math.abs(px[i * 4 + 2] - b);
  const TOL = 54;                                  // summed RGB distance
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (const i of border) if (!bg[i] && dev(i) < TOL) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0 && !bg[i - 1] && dev(i - 1) < TOL) { bg[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && !bg[i + 1] && dev(i + 1) < TOL) { bg[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && !bg[i - w] && dev(i - w) < TOL) { bg[i - w] = 1; stack.push(i - w); }
    if (y < h - 1 && !bg[i + w] && dev(i + w) < TOL) { bg[i + w] = 1; stack.push(i + w); }
  }
  return { bg, uniformBorder: maxDev < 120 };
}

function runsInRow(mask, w, y, x0, x1) {
  const runs = [];
  let start = -1;
  for (let x = x0; x <= x1; x++) {
    const on = mask[y * w + x] === 1;
    if (on && start < 0) start = x;
    if ((!on || x === x1) && start >= 0) { runs.push([start, on ? x : x - 1]); start = -1; }
  }
  // merge runs separated by tiny gaps
  const gap = Math.max(2, Math.round((x1 - x0) * 0.03));
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= gap) last[1] = r[1]; else merged.push([...r]);
  }
  return merged;
}

/** Silhouette-based guess. mask: 1 = garment pixel inside the cropped box (w x h). */
export function guessFromSilhouette(mask, w, h) {
  const aspect = h / w;
  const band = (f0, f1) => {
    let span = 0, runsMax = 0, widest = 0, gapMax = 0;
    const ya = Math.floor(h * f0), yb = Math.max(ya + 1, Math.floor(h * f1));
    for (let y = ya; y < yb; y++) {
      const runs = runsInRow(mask, w, y, 0, w - 1);
      if (!runs.length) continue;
      const lo = runs[0][0], hi = runs[runs.length - 1][1];
      widest = Math.max(widest, (hi - lo + 1) / w);
      runsMax = Math.max(runsMax, runs.length);
      for (let k = 1; k < runs.length; k++) gapMax = Math.max(gapMax, (runs[k][0] - runs[k - 1][1]) / w);
      span += (hi - lo + 1) / w;
    }
    return { avg: span / (yb - ya), runs: runsMax, widest, gap: gapMax };
  };
  const top = band(0.08, 0.25), mid = band(0.45, 0.6), low = band(0.8, 0.97);
  const legsSplit = low.runs >= 2 && low.gap > 0.06;
  if (aspect >= 1.15 && legsSplit) return { category: 'pant', confidence: 0.75 };
  if (aspect >= 1.4 && !legsSplit) {
    // long garment with no leg gap: dress/kurti/saree. Very long & narrow-to-uniform => dress.
    return { category: aspect > 2.2 ? 'saree' : 'dress', confidence: 0.4 };
  }
  const sleeves = top.widest > 0.9 && mid.avg > 0 && top.widest / Math.max(mid.avg, 0.05) > 1.22;
  if (aspect <= 1.4 && sleeves) return { category: 'tshirt', confidence: 0.55 };
  if (aspect < 0.9 && mid.avg > 0.9 && top.avg > 0.9) return { category: 'saree', confidence: 0.35 };   // folded saree flat-lay
  if (aspect <= 1.4) return { category: 'tshirt', confidence: 0.35 };
  return { category: null, confidence: 0 };
}

function analyze(img, tainted) {
  const out = { canvas: null, category: null, confidence: 0, mode: 'none' };
  if (tainted) return out;
  try {
    const sc = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(2, Math.round(img.naturalWidth * sc)), h = Math.max(2, Math.round(img.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data, N = w * h;

    let transparent = 0;
    for (let i = 0; i < N; i += 7) if (px[i * 4 + 3] < 200) transparent++;
    const hasAlpha = transparent / (N / 7) > 0.03;

    const fg = new Uint8Array(N);
    if (hasAlpha) { for (let i = 0; i < N; i++) fg[i] = px[i * 4 + 3] > 40 ? 1 : 0; out.mode = 'alpha'; }
    else {
      const { bg, uniformBorder } = floodBackground(px, w, h);
      if (!uniformBorder) return out;               // busy photo background: cannot cut out reliably
      let n = 0; for (let i = 0; i < N; i++) { fg[i] = bg[i] ? 0 : 1; n += fg[i]; }
      const ratio = n / N;
      if (ratio < 0.06 || ratio > 0.97) return out;   // flood ate the garment (white on white) or found nothing
      out.mode = 'background-removed';
    }

    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fg[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return out;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < 20 || bh < 20) return out;

    const cut = document.createElement('canvas'); cut.width = bw; cut.height = bh;
    const cctx = cut.getContext('2d');
    const od = cctx.createImageData(bw, bh);
    const mask = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const si = (y + y0) * w + (x + x0), di = y * bw + x;
      od.data[di * 4] = px[si * 4]; od.data[di * 4 + 1] = px[si * 4 + 1]; od.data[di * 4 + 2] = px[si * 4 + 2];
      od.data[di * 4 + 3] = fg[si] ? (hasAlpha ? px[si * 4 + 3] : 255) : 0;
      mask[di] = fg[si];
    }
    cctx.putImageData(od, 0, 0);
    out.canvas = cut;
    const g = guessFromSilhouette(mask, bw, bh);
    out.category = g.category; out.confidence = g.confidence;
  } catch { /* getImageData blocked or out of memory: fall back to the plain image */ }
  return out;
}

/**
 * Loads a product image and prepares it for the overlay.
 * Result: { image (drawable), width, height, tainted, cutout (bool), guess: {category, confidence} }
 */
export function prepareGarment(url) {
  if (cache.has(url)) return cache.get(url);
  const p = loadImage(url).then(({ img, tainted }) => {
    const a = analyze(img, tainted);
    const image = a.canvas || img;
    return {
      image, tainted, cutout: !!a.canvas, mode: a.mode,
      width: a.canvas ? a.canvas.width : img.naturalWidth, height: a.canvas ? a.canvas.height : img.naturalHeight,
      guess: { category: a.category, confidence: a.confidence },
    };
  });
  p.catch(() => cache.delete(url));
  cache.set(url, p);
  return p;
}
