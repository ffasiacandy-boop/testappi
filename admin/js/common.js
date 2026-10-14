/* Shared helpers. All DOM is built with textContent / createTextNode (never innerHTML) to prevent XSS. */
(function () {
  const VT = (window.VT = {});
  VT.loginUrl = 'login.html';

  VT.el = function (tag, attrs, ...kids) {
    const n = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    if (value !== undefined) n.value = value;
    return n;
  };
  const el = VT.el;

  VT.api = async function (method, path, body) {
    const res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'vt-dashboard' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let j = null;
    try { j = await res.json(); } catch (e) { /* ignore */ }
    if (res.ok && j && j.success) return j.data;
    if (res.status === 401 && !/^\/auth\/(login|register)/.test(path)) { location.href = VT.loginUrl; }
    const err = new Error(j && j.error ? j.error.message : 'Request failed.');
    err.code = j && j.error ? j.error.code : 'ERROR'; err.status = res.status;
    throw err;
  };

  VT.toast = function (msg, type) {
    let box = document.getElementById('toasts');
    if (!box) { box = el('div', { id: 'toasts' }); document.body.append(box); }
    const t = el('div', { class: 'toast ' + (type || '') }, msg);
    box.append(t);
    setTimeout(() => t.remove(), 3800);
  };

  VT.modal = function (title, body, buttons, subtitle) {
    return new Promise((resolve) => {
      const close = (v) => { overlay.remove(); resolve(v); };
      const foot = el('div', { class: 'foot' }, (buttons || []).map((b) =>
        el('button', { class: 'btn ' + (b.kind || ''), type: 'button', onclick: async (e) => {
          if (b.action) { e.target.disabled = true; try { const r = await b.action(); if (r !== false) close(r === undefined ? true : r); else e.target.disabled = false; } catch (err) { VT.toast(err.message, 'err'); e.target.disabled = false; } }
          else close(b.value === undefined ? false : b.value);
        } }, b.label)));
      const overlay = el('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(false); } },
        el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, el('h2', null, title), subtitle ? el('p', { class: 'muted', style: { margin: '2px 0 0' } }, subtitle) : null, body, foot));
      document.body.append(overlay);
      const f = overlay.querySelector('input,select'); if (f) f.focus();
    });
  };

  VT.confirm = (title, message, { confirmText = 'Confirm', danger = false } = {}) =>
    VT.modal(title, el('p', { class: 'muted' }, message), [{ label: 'Cancel', value: false }, { label: confirmText, kind: danger ? 'danger' : 'primary', value: true }]);

  VT.field = (label, input) => el('div', null, el('label', null, label), input);

  VT.fmtDate = (s) => {
    if (!s) return '-';
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  VT.todayPlus = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const ICON = { ACTIVE: '\uD83D\uDFE2', DISABLED: '\uD83D\uDD34', SUSPENDED: '\uD83D\uDFE0', EXPIRED: '\u26AB' };
  VT.badge = (status) => el('span', { class: 'badge b-' + status }, (ICON[status] || '') + ' ' + status);
  VT.yesNo = (v, y, n) => el('span', { class: 'badge b-' + (v ? 'yes' : 'no') }, v ? y : n);
  VT.empty = (icon, text) => el('div', { class: 'empty' }, el('div', { class: 'ico' }, icon), el('div', null, text));
  VT.spinner = () => el('div', { class: 'spinner' });

  VT.table = (headers, rows) => el('div', { class: 'tablewrap' }, el('table', null,
    el('thead', null, el('tr', null, headers.map((h) => el('th', null, h)))),
    el('tbody', null, rows.map((r) => el('tr', null, r.map((c) => el('td', null, c)))))));

  VT.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); VT.toast('Copied to clipboard', 'ok'); }
    catch (e) {
      const t = el('textarea', { style: { position: 'fixed', opacity: '0' } }); t.value = text; document.body.append(t); t.select();
      try { document.execCommand('copy'); VT.toast('Copied to clipboard', 'ok'); } catch (e2) { VT.toast('Copy failed', 'err'); } t.remove();
    }
  };

  VT.logout = async () => { try { await VT.api('POST', '/auth/logout'); } catch (e) { /* ignore */ } location.href = VT.loginUrl; };
})();
