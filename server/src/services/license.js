const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');
const { AppError } = require('../utils/respond');
const { today, addDays, nowIso, normalizeDomain, normalizeLicenseKey } = require('../utils/validate');

const CACHE_TTL_SECONDS = 24 * 3600;   // SDK may reuse a successful result for offline grace
const GRACE_SECONDS = 24 * 3600;

const effectiveStatus = (l) => (l.status === 'ACTIVE' && l.expiry_date < today() ? 'EXPIRED' : l.status);
const present = (l) => (l ? { ...l, effective_status: effectiveStatus(l) } : null);
const getLicense = (id) => present(db.prepare('SELECT * FROM licenses WHERE id = ?').get(id));

// API key = "vto_" + 128 random bits. This is the key admins hand to clients (stored in the license_key column).
function generateKey() {
  for (let i = 0; i < 20; i++) {
    const key = `vto_${crypto.randomBytes(16).toString('hex')}`;
    if (!db.prepare('SELECT 1 FROM licenses WHERE license_key = ?').get(key)) return key;
  }
  throw new AppError(500, 'SERVER_ERROR', 'Could not generate an API key.');
}

// Issues a brand-new key for the same license: the old key stops working immediately.
function regenerateKey(id) {
  const l = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!l) throw new AppError(404, 'NOT_FOUND', 'License not found.');
  db.prepare('UPDATE licenses SET license_key = ?, updated_at = ? WHERE id = ?').run(generateKey(), nowIso(), id);
  return getLicense(id);
}

function syncSubscription(clientId) {
  const l = db.prepare('SELECT * FROM licenses WHERE client_id = ? ORDER BY id DESC LIMIT 1').get(clientId);
  if (!l) return;
  const now = nowIso();
  const st = effectiveStatus(l);
  const s = db.prepare('SELECT id FROM subscriptions WHERE client_id = ?').get(clientId);
  if (s) db.prepare('UPDATE subscriptions SET plan=?, start_date=?, expiry_date=?, status=?, updated_at=? WHERE id=?').run(l.plan, l.start_date, l.expiry_date, st, now, s.id);
  else db.prepare('INSERT INTO subscriptions (client_id, plan, start_date, expiry_date, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(clientId, l.plan, l.start_date, l.expiry_date, st, now, now);
}

function createLicense({ client_id, plan, start_date, expiry_date, key }) {
  const now = nowIso();
  const info = db.prepare('INSERT INTO licenses (client_id, license_key, plan, status, start_date, expiry_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(client_id, key || generateKey(), plan, 'ACTIVE', start_date, expiry_date, now, now);
  syncSubscription(client_id);
  return getLicense(info.lastInsertRowid);
}

function updateLicense(id, fields) {
  const l = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!l) throw new AppError(404, 'NOT_FOUND', 'License not found.');
  const next = { ...l, ...fields };
  if (next.expiry_date < next.start_date) throw new AppError(400, 'VALIDATION_ERROR', 'Expiry date cannot be before the start date.');
  db.prepare('UPDATE licenses SET plan=?, status=?, start_date=?, expiry_date=?, updated_at=? WHERE id=?')
    .run(next.plan, next.status, next.start_date, next.expiry_date, nowIso(), id);
  syncSubscription(l.client_id);
  return getLicense(id);
}

// New expiry = later of (current expiry, today) + days. Does not change DISABLED/SUSPENDED status.
function extendLicense(id, days) {
  const l = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  if (!l) throw new AppError(404, 'NOT_FOUND', 'License not found.');
  const base = l.expiry_date > today() ? l.expiry_date : today();
  return updateLicense(id, { expiry_date: addDays(base, days) });
}

function listLicenses(where = '', params = []) {
  const rows = db.prepare(`SELECT l.*, c.company_name, u.name AS client_name, u.email AS client_email
    FROM licenses l JOIN clients c ON c.id = l.client_id JOIN users u ON u.id = c.user_id ${where} ORDER BY l.id DESC`).all(...params);
  return rows.map(present);
}

const PUBLIC_MESSAGES = {
  LICENSE_EXPIRED: 'Virtual Try-On access has expired. Please contact the store.',
  DOMAIN_NOT_ALLOWED: 'Virtual Try-On is not configured for this website.',
};
const UNAVAILABLE = 'Virtual Try-On is currently unavailable.';
const publicMessage = (code) => PUBLIC_MESSAGES[code] || UNAVAILABLE;

// Returns { ok:true, data } or { ok:false, code }.
function validatePublic({ license, domain, origin, ip }) {
  const key = normalizeLicenseKey(license);
  const host = normalizeDomain(domain);
  if (!key || !host) { logger.warn('license_invalid_input', { ip }); return { ok: false, code: 'LICENSE_NOT_FOUND' }; }

  // The browser-sent Origin cannot be forged by page JS; if present it must agree with the claimed domain.
  if (origin && origin !== 'null') {
    const originHost = normalizeDomain(origin);
    if (originHost !== host) { logger.warn('license_origin_mismatch', { license: key, domain: host, origin: originHost, ip }); return { ok: false, code: 'DOMAIN_NOT_ALLOWED' }; }
  }

  const l = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(key);
  if (!l) { logger.warn('license_not_found', { license: key, domain: host, ip }); return { ok: false, code: 'LICENSE_NOT_FOUND' }; }

  const allowed = db.prepare('SELECT 1 FROM domains WHERE client_id = ? AND domain = ? AND verified = 1').get(l.client_id, host);
  if (!allowed) { logger.warn('license_invalid_domain', { license: key, domain: host, ip }); return { ok: false, code: 'DOMAIN_NOT_ALLOWED' }; }

  const st = effectiveStatus(l);
  if (st === 'DISABLED') { logger.info('license_disabled', { license: key, domain: host }); return { ok: false, code: 'LICENSE_DISABLED' }; }
  if (st === 'SUSPENDED') { logger.info('license_suspended', { license: key, domain: host }); return { ok: false, code: 'LICENSE_SUSPENDED' }; }
  if (st === 'EXPIRED') { logger.info('license_expired', { license: key, domain: host }); return { ok: false, code: 'LICENSE_EXPIRED' }; }

  logger.info('license_validated', { license: key, domain: host });
  return { ok: true, data: { valid: true, status: 'ACTIVE', plan: l.plan, expiresAt: l.expiry_date, cacheTtlSeconds: CACHE_TTL_SECONDS, graceSeconds: GRACE_SECONDS } };
}

module.exports = { regenerateKey, effectiveStatus, present, getLicense, createLicense, updateLicense, extendLicense, listLicenses, syncSubscription, validatePublic, publicMessage };
