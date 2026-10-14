import { MSG, messageForCode } from './messages.js';
import { createLicenseClient } from './license.js';
import { Camera } from './camera.js';
import { PoseTracker } from './pose.js';
import { Renderer } from './renderer.js';
import { getAdapter, supportedCategories } from './adapters/index.js';
import { TryOnModal } from './ui/modal.js';
import { extractProduct, looksLikeProductPage } from './detect/product.js';
import { prepareGarment } from './detect/image.js';
import { createLauncher } from './detect/launcher.js';

/* global __VTO_API_URL__ */
const BUILD_API_URL = typeof __VTO_API_URL__ === 'string' ? __VTO_API_URL__ : '';
const SCRIPT = document.currentScript;
const SCRIPT_ORIGIN = (() => { try { return new URL(SCRIPT.src).origin; } catch { return ''; } })();
const API_KEY_RE = /^vto_[a-z0-9_]{8,64}$/i;
const log = (...a) => console.error('[VirtualTryOn]', ...a);

function checkConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'init() needs a configuration object.';
  if (typeof cfg.apiKey !== 'string' || !API_KEY_RE.test(cfg.apiKey.trim())) return 'Invalid or missing "apiKey" (expected vto_...).';
  return null;
}

function cameraErrorMessage(e) {
  switch (e && e.name) {
    case 'NotAllowedError': case 'SecurityError': case 'PermissionDeniedError': return MSG.permission;
    case 'NotReadableError': case 'AbortError': return MSG.cameraBusy;
    default: return MSG.noCamera;
  }
}

function createInstance(cfg) {
  const configError = checkConfig(cfg);
  if (configError) log(configError);
  const apiUrl = (cfg && cfg.apiUrl) || BUILD_API_URL || SCRIPT_ORIGIN;
  const licenseClient = configError ? null : createLicenseClient({ apiUrl, license: cfg.apiKey.trim().toLowerCase() });
  let product = null, AdapterClass = null, productSig = '';

  // Product data comes from the page itself (name, price, image, category), detected fresh on every open so it is
  // always current (also for single-page apps). Anything passed in cfg.product overrides the detected value.
  async function resolveProduct() {
    const found = { ...extractProduct(), ...(cfg.product || {}) };
    if (!found.garmentImage) return { error: MSG.noProduct };
    found.garmentImage = new URL(found.garmentImage, location.href).href;
    let prepared;
    try { prepared = await prepareGarment(found.garmentImage); } catch { return { error: MSG.imageFail }; }
    // Category: explicit config > page text (name/breadcrumbs/URL) > what the image silhouette looks like.
    if (!found.category && prepared.guess.category && prepared.guess.confidence >= 0.3) { found.category = prepared.guess.category; found.categorySource = 'image'; }
    return { product: found };
  }

  let modal = null, camera = null, tracker = null, renderer = null, adapter = null;
  let opened = false, running = false, destroyed = false, raf = 0, facing = 'user', lastBlob = null;
  let lastVideoTime = -1, lastDetect = 0, infMs = 0, interval = 0, seen = 0, lastSeen = 0, state = 'info';
  const triggers = [];

  function ensureModal() {
    if (modal) return;
    modal = new TryOnModal({
      onClose: close, onStart: startCamera, onStop: stopCamera, onSwitch: switchCamera, onCapture: capture,
      onRetry: () => { camera && camera.stop(); modal.screen('intro'); },
      onRetake: resume, onDownload: download,
    });
    camera = new Camera(modal.video);
    renderer = new Renderer(modal.canvas);
  }

  async function open() {
    if (destroyed || opened) return;
    opened = true;
    ensureModal();
    modal.show('');
    modal.screen('loading', MSG.loading);
    if (configError) return modal.error(MSG.unavailable, { retry: false });
    const res = await licenseClient.validate();       // authoritative backend check on every open
    if (!opened) return;
    if (!res.ok) return modal.error(res.message || messageForCode(res.code), { retry: false });
    const r = await resolveProduct();
    if (!opened) return;
    if (r.error) return modal.error(r.error, { retry: false });
    const sig = `${r.product.garmentImage}|${r.product.category}`;
    if (sig !== productSig) { adapter = null; productSig = sig; }
    product = r.product;
    AdapterClass = getAdapter(product.category);
    modal.setProduct([product.name, product.price].filter(Boolean).join(' \u00b7 '));
    if (!AdapterClass) { log(`Unsupported category "${product.category}". Supported: ${supportedCategories().join(', ')}`); return modal.error(MSG.unsupportedCategory, { retry: false }); }
    if (!Camera.supported()) return modal.error(MSG.unsupportedBrowser, { retry: false });
    modal.screen('intro');
  }

  async function ensureTracker() {
    if (!tracker) tracker = new PoseTracker(cfg.assets);
    await tracker.load();
  }

  async function startCamera() {
    if (running) return;
    modal.screen('loading', MSG.loading);
    const trackerReady = ensureTracker(); trackerReady.catch(() => {});   // load AI while the permission prompt is open
    try { await camera.start(facing); } catch (e) { return modal.error(cameraErrorMessage(e)); }
    if (!opened) { camera.stop(); return; }
    try {
      if (!adapter) adapter = new AdapterClass(product);
      await Promise.all([adapter.load(), trackerReady]);
    } catch (e) {
      camera.stop();
      return modal.error(e && e.code === 'IMAGE' ? MSG.imageFail : MSG.modelFail);
    }
    if (!opened) { camera.stop(); return; }
    begin();
    modal.showSwitch(await camera.hasMultiple());
  }

  function begin() {
    renderer.setMirror(camera.mirrored);
    adapter.reset();
    modal.screen('live');
    modal.status('info', MSG.stand);
    state = 'info'; seen = 0; lastSeen = performance.now(); lastVideoTime = -1; lastDetect = 0; infMs = 0; interval = 0;
    running = true;
    raf = requestAnimationFrame(loop);
  }

  function makePose(lm) {
    return {
      width: renderer.cw, height: renderer.ch,
      get(i) {
        const p = lm[i];
        if (!p || (p.visibility !== undefined && p.visibility < 0.5)) return null;
        if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return null;
        const c = renderer.toCanvas(p.x, p.y);
        return { x: c.x, y: c.y };
      },
    };
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const v = camera.video;
    if (v.readyState < 2 || !v.videoWidth || v.currentTime === lastVideoTime) return;   // draw only on new camera frames
    lastVideoTime = v.currentTime;
    renderer.layout(v);

    if (now - lastDetect >= interval) {                 // adaptive frame skipping: slower devices detect less often
      lastDetect = now;
      const t0 = performance.now();
      let lm = null;
      try { lm = tracker.detect(v); } catch { /* skip this frame */ }
      const dt = performance.now() - t0;
      infMs = infMs ? infMs * 0.8 + dt * 0.2 : dt;
      interval = infMs < 22 ? 0 : infMs < 40 ? 33 : infMs < 70 ? 66 : 100;     // ~30 / 20 / 12 / 8 detections per second
      const t = adapter.update(lm ? makePose(lm) : null, now / 1000);
      if (t) {
        lastSeen = now; seen += 1;
        if (seen >= 3 && state !== 'ok') { state = 'ok'; modal.status('ok', MSG.ready); }
      } else {
        seen = 0;
        if (now - lastSeen > 600 && state !== 'warn') { state = 'warn'; modal.status('warn', MSG.move); }
      }
    }
    renderer.draw(v, adapter, now - lastSeen < 600);
  }

  function pause() { running = false; cancelAnimationFrame(raf); }
  function resume() { if (!camera.stream) return; modal.screen('live'); running = true; lastVideoTime = -1; raf = requestAnimationFrame(loop); }

  function stopCamera() { pause(); camera.stop(); modal.screen('intro'); }

  async function switchCamera() {
    const next = facing === 'user' ? 'environment' : 'user';
    pause();
    try { await camera.start(next); facing = next; } catch { try { await camera.start(facing); } catch (e) { return modal.error(cameraErrorMessage(e)); } modal.toast('Could not switch camera.'); }
    begin();
  }

  function capture() {
    try {
      renderer.canvas.toBlob((blob) => {
        if (!blob) return modal.toast(MSG.captureFail);
        if (lastBlob) URL.revokeObjectURL(lastBlob.url);
        lastBlob = { blob, url: URL.createObjectURL(blob) };
        pause();
        modal.preview(lastBlob.url);
      }, 'image/png');
    } catch { modal.toast(MSG.captureFail); }     // canvas tainted by a cross-origin image without CORS headers
  }

  function download() {      // stays on the device: a local file download, nothing is uploaded
    if (!lastBlob) return;
    const a = document.createElement('a');
    a.href = lastBlob.url; a.download = `try-on-${product.id}.png`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function close() {
    if (!opened) return;
    opened = false; pause();
    if (camera) camera.stop();
    if (lastBlob) { URL.revokeObjectURL(lastBlob.url); lastBlob = null; }
    if (modal) modal.hide();
  }

  function destroy() {
    close(); destroyed = true;
    triggers.forEach(([el, fn]) => el.removeEventListener('click', fn));
    if (tracker) tracker.close();
    if (modal) modal.destroy();
  }

  function bindTrigger(t) {
    const els = typeof t === 'string' ? document.querySelectorAll(t) : t instanceof Element ? [t] : [];
    els.forEach((el) => { const fn = (e) => { e.preventDefault(); open(); }; el.addEventListener('click', fn); triggers.push([el, fn]); });
  }
  if (cfg && cfg.trigger) bindTrigger(cfg.trigger);

  // Early, silent validation so integrators can see problems; open() always re-validates.
  const ready = licenseClient ? licenseClient.validate().then((r) => { if (!r.ok) log(`API key check failed (${r.code || 'invalid'}).`); return r.ok; }) : Promise.resolve(false);

  return { open, close, destroy, ready };
}

/**
 * Zero-config mode: <script src=".../vto.js" data-api-key="vto_..." defer></script>
 * Finds the product on the page, and shows a "Virtual Try-On" button on every product page.
 * The button only appears while the API key is valid (disabling the key in the admin panel removes it).
 */
function autoMount(opts) {
  let instance = null, launcher = null, mountedFor = '', timer = 0, busy = false;

  async function sync() {
    if (busy) return;
    busy = true;
    try {
      const isProduct = looksLikeProductPage();
      const sig = isProduct ? location.href : '';
      if (!isProduct) { teardown(); mountedFor = ''; return; }
      if (launcher && launcher.host.isConnected && mountedFor === sig) return;
      if (launcher && mountedFor === sig) { launcher.ensureAttached(); return; }
      teardown();
      mountedFor = sig;
      const inst = createInstance({ apiKey: opts.apiKey, apiUrl: opts.apiUrl, assets: opts.assets });
      const ok = await inst.ready;                      // key must be valid for this domain, else no button at all
      if (mountedFor !== sig) { inst.destroy(); return; }
      if (!ok) { inst.destroy(); mountedFor = ''; return; }
      instance = inst;
      launcher = createLauncher({ text: opts.buttonText, color: opts.buttonColor, selector: opts.selector, position: opts.position, onClick: () => inst.open() });
    } finally { busy = false; }
  }
  function teardown() { if (launcher) launcher.destroy(); if (instance) instance.destroy(); launcher = null; instance = null; }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(sync, 700); };

  sync();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });   // SPA navigation / late rendering
  for (const m of ['pushState', 'replaceState']) { const o = history[m]; history[m] = function (...a) { const r = o.apply(this, a); schedule(); return r; }; }
  window.addEventListener('popstate', schedule);
  return { destroy() { clearTimeout(timer); teardown(); } };
}

const VirtualTryOn = {
  version: '2.0.0',
  /** Manual mode. `product` is optional: anything omitted is detected from the page. */
  async init(config) { return createInstance(config); },
  autoMount,
  /** Debug helper: what the SDK detects on the current page (name, price, image, category and how it was found). */
  async detect() {
    const p = extractProduct();
    if (p.garmentImage) {
      try { const g = await prepareGarment(new URL(p.garmentImage, location.href).href); p.image = { cutout: g.cutout, mode: g.mode, guess: g.guess }; if (!p.category && g.guess.category) { p.category = g.guess.category; p.categorySource = 'image'; } } catch { p.image = { error: true }; }
    }
    return p;
  },
};
window.VirtualTryOn = VirtualTryOn;

if (SCRIPT && SCRIPT.dataset && SCRIPT.dataset.apiKey && SCRIPT.dataset.auto !== 'false') {
  const d = SCRIPT.dataset;
  const start = () => autoMount({ apiKey: d.apiKey, apiUrl: d.apiUrl, buttonText: d.buttonText, buttonColor: d.buttonColor, selector: d.selector, position: d.position });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
