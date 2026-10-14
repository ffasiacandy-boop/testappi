import { MSG } from '../messages.js';

const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(6,8,18,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center}
.dialog{position:relative;width:100%;height:100%;background:#0b0d17;color:#fff;display:flex;flex-direction:column;overflow:hidden}
@media(min-width:720px){.backdrop{padding:24px}.dialog{max-width:520px;height:min(860px,100%);border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.55)}}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(14px + env(safe-area-inset-top,0px)) 16px 12px}
h2{margin:0;font-size:17px;font-weight:650;letter-spacing:.2px}
.pname{margin:2px 0 0;font-size:12.5px;color:#9aa0b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw}
button{font:inherit;color:inherit;cursor:pointer;border:0}
.icon{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.1);font-size:16px;display:grid;place-items:center}
.icon:hover{background:rgba(255,255,255,.18)}
.stage{position:relative;flex:1;min-height:0;background:#000}
canvas{position:absolute;inset:0;width:100%;height:100%;display:none}
video{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
[data-screen=live] canvas,[data-screen=preview] canvas{display:block}
.pill{position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(15,18,32,.78);backdrop-filter:blur(8px);font-size:13.5px;font-weight:550;white-space:nowrap;display:none;max-width:92%;overflow:hidden;text-overflow:ellipsis}
[data-screen=live] .pill{display:block}
.pill.ok{background:rgba(22,163,74,.88)}.pill.warn{background:rgba(217,119,6,.9)}
.screen{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px;text-align:center;background:radial-gradient(circle at 50% 30%,#1a1d33,#0b0d17 70%)}
.screen p{margin:0;font-size:15.5px;line-height:1.5;color:#d6d9ea;white-space:pre-line;max-width:320px}
.glyph{width:72px;height:72px;border-radius:22px;background:linear-gradient(135deg,#6d5efc,#9b5bff);display:grid;place-items:center;font-size:32px}
.glyph.err{background:linear-gradient(135deg,#ef4444,#f97316)}
.spin{width:44px;height:44px;border-radius:50%;border:4px solid rgba(255,255,255,.15);border-top-color:#8b7dff;animation:s 0.9s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
[data-screen=intro] .s-intro,[data-screen=loading] .s-loading,[data-screen=error] .s-error{display:flex}
.s-preview{padding:0;background:#000}.s-preview img{width:100%;height:100%;object-fit:contain}
[data-screen=preview] .s-preview{display:flex}
footer{padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));background:#0b0d17}
.privacy{margin:0 0 12px;font-size:11.5px;line-height:1.4;color:#8b90a8;text-align:center}
.controls{display:none;align-items:center;justify-content:center;gap:18px;min-height:64px}
[data-screen=intro] .g-intro,[data-screen=live] .g-live,[data-screen=error] .g-error,[data-screen=preview] .g-preview{display:flex}
.btn{padding:14px 26px;border-radius:14px;background:linear-gradient(135deg,#6d5efc,#8b5cf6);font-weight:650;font-size:15px}
.btn.ghost{background:rgba(255,255,255,.12)}
.btn:hover{filter:brightness(1.1)}
.shutter{width:68px;height:68px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,.35);background-clip:padding-box}
.shutter:active{transform:scale(.94)}
.side{width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.12);font-size:20px;display:grid;place-items:center}
.side[hidden]{display:none}.side.slot{visibility:hidden;display:grid}
button:focus-visible{outline:3px solid #a79bff;outline-offset:2px}
.toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(15,18,32,.92);padding:9px 14px;border-radius:10px;font-size:13px;display:none}
`;

const HTML = `
<div class="backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-label="Virtual Try-On" data-screen="loading">
  <header>
    <div><h2>Virtual Try-On</h2><p class="pname"></p></div>
    <button class="icon close" aria-label="Close">\u2715</button>
  </header>
  <div class="stage">
    <video playsinline muted></video>
    <canvas></canvas>
    <div class="pill"></div>
    <div class="screen s-intro"><div class="glyph">\ud83d\udc55</div><p class="t-intro"></p></div>
    <div class="screen s-loading"><div class="spin"></div><p class="t-loading"></p></div>
    <div class="screen s-error"><div class="glyph err">!</div><p class="t-error"></p></div>
    <div class="screen s-preview"><img alt="Your try-on photo"></div>
    <div class="toast"></div>
  </div>
  <footer>
    <p class="privacy"></p>
    <div class="controls g-intro"><button class="btn start">Start camera</button></div>
    <div class="controls g-live">
      <button class="side switch" aria-label="Switch camera" title="Switch camera">\u21c4</button>
      <button class="shutter capture" aria-label="Capture"></button>
      <button class="side stop" aria-label="Stop camera" title="Stop camera">\u25a0</button>
    </div>
    <div class="controls g-error"><button class="btn retry">Try again</button></div>
    <div class="controls g-preview"><button class="btn ghost retake">Retake</button><button class="btn download">Download</button></div>
  </footer>
</div></div>`;

export class TryOnModal {
  constructor(handlers) {
    this.h = handlers;
    this.host = document.createElement('div');
    this.host.setAttribute('data-vto-root', '');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${CSS}</style>${HTML}`;
    this.q = (s) => this.root.querySelector(s);
    this.dialog = this.q('.dialog');
    this.video = this.q('video');
    this.canvas = this.q('canvas');
    this.q('.t-intro').textContent = MSG.intro;
    this.q('.privacy').textContent = MSG.privacy;
    this.q('.close').addEventListener('click', () => this.h.onClose());
    this.q('.start').addEventListener('click', () => this.h.onStart());
    this.q('.stop').addEventListener('click', () => this.h.onStop());
    this.q('.switch').addEventListener('click', () => this.h.onSwitch());
    this.q('.capture').addEventListener('click', () => this.h.onCapture());
    this.q('.retry').addEventListener('click', () => this.h.onRetry());
    this.q('.retake').addEventListener('click', () => this.h.onRetake());
    this.q('.download').addEventListener('click', () => this.h.onDownload());
    this.q('.backdrop').addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) this.h.onClose(); });
    this._key = (e) => { if (e.key === 'Escape') this.h.onClose(); };
    this._prevOverflow = null;
  }

  show(productName) {
    this.q('.pname').textContent = productName || '';
    if (!this.host.isConnected) document.body.appendChild(this.host);
    this._prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', this._key);
    this.q('.close').focus();
  }
  setProduct(label) { this.q('.pname').textContent = label || ''; }
  hide() {
    document.removeEventListener('keydown', this._key);
    if (this._prevOverflow !== null) document.documentElement.style.overflow = this._prevOverflow;
    this._prevOverflow = null;
    this.host.remove();
  }
  destroy() { this.hide(); }

  screen(name, text) {
    this.dialog.dataset.screen = name;
    if (name === 'loading') this.q('.t-loading').textContent = text || MSG.loading;
  }
  error(text, { retry = true } = {}) {
    this.q('.t-error').textContent = text;
    this.q('.retry').style.display = retry ? '' : 'none';
    this.screen('error');
  }
  status(kind, text) {
    const p = this.q('.pill');
    p.className = `pill ${kind || ''}`;
    p.textContent = text;
  }
  showSwitch(on) { this.q('.switch').classList.toggle('slot', !on); this.q('.switch').disabled = !on; }
  preview(url) { this.q('.s-preview img').src = url; this.screen('preview'); }
  toast(text) {
    const t = this.q('.toast');
    t.textContent = text; t.style.display = 'block';
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { t.style.display = 'none'; }, 3200);
  }
}
