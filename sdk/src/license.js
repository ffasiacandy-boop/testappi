import { messageForCode, MSG } from './messages.js';

const KEY = 'vto:license:';
const today = () => new Date().toISOString().slice(0, 10);

function readCache(license) {
  try { return JSON.parse(localStorage.getItem(KEY + license) || 'null'); } catch { return null; }
}
function writeCache(license, v) { try { localStorage.setItem(KEY + license, JSON.stringify(v)); } catch { /* storage unavailable */ } }
function clearCache(license) { try { localStorage.removeItem(KEY + license); } catch { /* ignore */ } }

/**
 * The backend is always asked first, so an admin disabling a license takes effect on the next try-on open.
 * Only when the backend is unreachable (network error / 5xx / 429) a previous success is honoured for a
 * limited grace period (server-provided, 24h). After that, backend validation is required again.
 */
export function createLicenseClient({ apiUrl, license }) {
  const endpoint = `${apiUrl.replace(/\/$/, '')}/api/license/validate`;

  async function validate() {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, mode: 'cors', credentials: 'omit',
        body: JSON.stringify({ license, domain: location.hostname }), signal: ctl.signal,
      });
      clearTimeout(timer);
      let body = null;
      try { body = await res.json(); } catch { /* non-JSON */ }
      if (res.ok && body && body.success && body.data && body.data.valid) {
        const d = body.data;
        writeCache(license, { graceUntil: Date.now() + (d.graceSeconds || 86400) * 1000, plan: d.plan, expiresAt: d.expiresAt });
        return { ok: true, plan: d.plan, expiresAt: d.expiresAt, offline: false };
      }
      if (res.status !== 429 && res.status < 500 && body && body.error) {
        clearCache(license);
        return { ok: false, code: body.error.code, message: messageForCode(body.error.code) };
      }
      throw new Error('temporary');
    } catch {
      const c = readCache(license);
      if (c && Date.now() < c.graceUntil && (!c.expiresAt || c.expiresAt >= today())) return { ok: true, plan: c.plan, expiresAt: c.expiresAt, offline: true };
      return { ok: false, code: 'UNAVAILABLE', message: MSG.unavailable };
    }
  }
  return { validate };
}
