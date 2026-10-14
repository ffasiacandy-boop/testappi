const express = require('express');
const cfg = require('../config');
const db = require('../db');
const logger = require('../utils/logger');
const { ok, wrap, AppError } = require('../utils/respond');
const v = require('../utils/validate');
const { PLANS } = require('../utils/catalog');
const { authenticate, requireAdmin, csrfGuard } = require('../middleware/auth');
const lic = require('../services/license');
const crypto = require('crypto');
const { createClientAccount, addDomain } = require('../services/accounts');

const r = express.Router();
r.use(authenticate, csrfGuard, requireAdmin);

const reqPlan = (p) => { const s = String(p || '').toUpperCase(); if (!PLANS.includes(s)) throw v.bad(`Plan must be one of: ${PLANS.join(', ')}.`); return s; };
const domainsOf = (clientId) => db.prepare('SELECT * FROM domains WHERE client_id = ? ORDER BY id').all(clientId);
const audit = (req, action, meta) => logger.audit(req.user.id, action, meta);

// Script URL clients embed on their site (shown in the admin UI snippet).
r.get('/config', wrap(async (req, res) => ok(res, { sdkUrl: `${cfg.sdkCdnUrl || `${req.protocol}://${req.get('host')}/cdn`}/vto.js` })));

r.get('/stats', wrap(async (req, res) => {
  const all = lic.listLicenses();
  const count = (s) => all.filter((l) => l.effective_status === s).length;
  const soon = v.addDays(v.today(), 30);
  ok(res, {
    clients: db.prepare("SELECT COUNT(*) AS n FROM clients").get().n,
    licenses: all.length,
    active: count('ACTIVE'), disabled: count('DISABLED'), suspended: count('SUSPENDED'), expired: count('EXPIRED'),
    expiringSoon: all.filter((l) => l.effective_status === 'ACTIVE' && l.expiry_date <= soon).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)),
  });
}));

// Clients
r.post('/clients', wrap(async (req, res) => {
  const b = req.body || {};
  const data = {
    name: v.reqString(b.name, 'Name', { max: 100 }), email: v.reqEmail(b.email),
    password: crypto.randomBytes(24).toString('hex'),   // clients never sign in (no client portal); the password is random and unknown
    company_name: v.reqString(b.company_name, 'Company name', { max: 150 }), phone: v.optString(b.phone, 'Phone', { max: 30 }),
  };
  const ids = await createClientAccount(data);
  audit(req, 'client_created', { clientId: ids.clientId });
  ok(res, { client_id: ids.clientId }, 201);
}));
r.get('/clients', wrap(async (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.company_name, c.phone, c.created_at, u.name, u.email,
      0 AS product_count
    FROM clients c JOIN users u ON u.id = c.user_id ORDER BY c.id DESC`).all();
  ok(res, {
    clients: rows.map((c) => {
      const l = lic.listLicenses('WHERE l.client_id = ?', [c.id])[0] || null;
      return { ...c, license: l, domains: domainsOf(c.id) };
    }),
  });
}));
r.get('/clients/:id', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const c = db.prepare('SELECT c.*, u.name, u.email FROM clients c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(id);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  ok(res, {
    client: c, licenses: lic.listLicenses('WHERE l.client_id = ?', [id]), domains: domainsOf(id),
  });
}));
r.delete('/clients/:id', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const c = db.prepare('SELECT user_id FROM clients WHERE id = ?').get(id);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  db.prepare('DELETE FROM users WHERE id = ?').run(c.user_id);   // cascades to client, licenses, domains
  audit(req, 'client_deleted', { clientId: id });
  ok(res, {});
}));
r.post('/clients/:id/domains', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(id)) throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  const domain = v.normalizeDomain((req.body || {}).domain);
  if (!domain) throw v.bad('Please enter a valid domain such as shop.example.com');
  const d = addDomain(id, domain, true);
  audit(req, 'domain_added', { clientId: id, domain });
  ok(res, { domain: d }, 201);
}));

// Domains & products overviews
r.get('/domains', wrap(async (req, res) => {
  ok(res, { domains: db.prepare('SELECT d.*, c.company_name FROM domains d JOIN clients c ON c.id = d.client_id ORDER BY d.id DESC').all() });
}));
r.patch('/domains/:id', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const verified = (req.body || {}).verified ? 1 : 0;
  const info = db.prepare('UPDATE domains SET verified = ? WHERE id = ?').run(verified, id);
  if (!info.changes) throw new AppError(404, 'NOT_FOUND', 'Domain not found.');
  audit(req, verified ? 'domain_verified' : 'domain_unverified', { domainId: id });
  ok(res, {});
}));
r.delete('/domains/:id', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const info = db.prepare('DELETE FROM domains WHERE id = ?').run(id);
  if (!info.changes) throw new AppError(404, 'NOT_FOUND', 'Domain not found.');
  audit(req, 'domain_removed', { domainId: id });
  ok(res, {});
}));

// Licenses
r.post('/licenses', wrap(async (req, res) => {
  const b = req.body || {};
  const client_id = v.reqId(b.client_id, 'client_id');
  if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(client_id)) throw new AppError(404, 'NOT_FOUND', 'Client not found.');
  const start_date = b.start_date ? v.reqDate(b.start_date, 'Start date') : v.today();
  const expiry_date = v.reqDate(b.expiry_date, 'Expiry date');
  if (expiry_date < start_date) throw v.bad('Expiry date cannot be before the start date.');
  const l = lic.createLicense({ client_id, plan: reqPlan(b.plan), start_date, expiry_date });
  audit(req, 'license_created', { licenseId: l.id, clientId: client_id });
  ok(res, { license: l }, 201);
}));
r.get('/licenses', wrap(async (req, res) => {
  const licenses = lic.listLicenses().map((l) => ({ ...l, domains: domainsOf(l.client_id) }));
  ok(res, { licenses });
}));
r.patch('/licenses/:id', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const b = req.body || {};
  const f = {};
  if (b.plan !== undefined) f.plan = reqPlan(b.plan);
  if (b.start_date !== undefined) f.start_date = v.reqDate(b.start_date, 'Start date');
  if (b.expiry_date !== undefined) f.expiry_date = v.reqDate(b.expiry_date, 'Expiry date');
  const l = lic.updateLicense(id, f);
  audit(req, 'license_updated', { licenseId: id, fields: Object.keys(f) });
  ok(res, { license: l });
}));
const setStatus = (action, status) => r.post(`/licenses/:id/${action}`, wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const l = lic.updateLicense(id, { status });
  audit(req, `license_${action}`, { licenseId: id });
  ok(res, { license: l });
}));
setStatus('enable', 'ACTIVE'); setStatus('reactivate', 'ACTIVE'); setStatus('disable', 'DISABLED'); setStatus('suspend', 'SUSPENDED');
r.post('/licenses/:id/regenerate-key', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const l = lic.regenerateKey(id);
  audit(req, 'api_key_regenerated', { licenseId: id });
  ok(res, { license: l });
}));
r.post('/licenses/:id/extend', wrap(async (req, res) => {
  const id = v.reqId(req.params.id);
  const days = v.reqInt((req.body || {}).days, 'days', 1, 3660);
  const l = lic.extendLicense(id, days);
  audit(req, 'license_extended', { licenseId: id, days });
  ok(res, { license: l });
}));

module.exports = r;
