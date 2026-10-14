// Floating / inline "Virtual Try-On" button. Rendered in a shadow root so the host page's CSS can't break it.
import { findCartButton } from './product.js';

export function createLauncher({ text, color, selector, position, onClick }) {
  const host = document.createElement('div');
  host.setAttribute('data-vto-launcher', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const c = /^#[0-9a-f]{3,8}$/i.test(color || '') ? color : '#5b4bf5';
  style.textContent = `
    :host{all:initial}
    button{all:initial;box-sizing:border-box;cursor:pointer;font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
      background:linear-gradient(135deg,${c},${c}dd);padding:13px 22px;border-radius:12px;display:inline-flex;align-items:center;gap:8px;
      box-shadow:0 6px 18px rgba(0,0,0,.18);transition:transform .15s,filter .15s}
    button:hover{filter:brightness(1.08)}button:active{transform:scale(.97)}
    button:focus-visible{outline:3px solid #a79bff;outline-offset:2px}
    :host(.float){position:fixed;right:18px;bottom:18px;z-index:2147482000}
    :host(.inline){display:block;margin:12px 0}
    :host(.inline) button{width:100%;justify-content:center}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = `👕 ${text || 'Virtual Try-On'}`;
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
  root.append(style, btn);

  function place() {
    let anchor = null;
    if (selector) { try { anchor = document.querySelector(selector); } catch { /* bad selector */ } }
    if (!anchor && position !== 'floating') anchor = findCartButton();
    if (anchor && anchor.parentNode) { host.className = 'inline'; anchor.parentNode.insertBefore(host, anchor.nextSibling); }
    else { host.className = 'float'; document.body.appendChild(host); }
  }
  place();
  return {
    host, // re-place if the host page removed us (SPA re-render)
    ensureAttached() { if (!host.isConnected) place(); },
    destroy() { host.remove(); },
  };
}
