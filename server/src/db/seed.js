const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cfg = require('../config');
const db = require('./index');
const logger = require('../utils/logger');
const { nowIso, today, addDays } = require('../utils/validate');
const { createLicense } = require('../services/license');
const { createClientAccount, addDomain, BCRYPT_ROUNDS } = require('../services/accounts');

async function seedAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1").get()) return;
  const now = nowIso();
  const hash = await bcrypt.hash(cfg.adminPassword, BCRYPT_ROUNDS);
  db.prepare('INSERT INTO users (name, email, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?)').run('Administrator', cfg.adminEmail, hash, 'ADMIN', now, now);
  logger.info('admin_seeded', { email: cfg.adminEmail });
}

// Development-only demo tenant so the demo store works out of the box. The account password is random and unknown.
async function seedDemo() {
  if (!cfg.seedDemo || cfg.isProd) return;
  if (db.prepare("SELECT 1 FROM licenses WHERE license_key = 'vto_demo_localkey_0001'").get()) return;
  const ids = await createClientAccount({ name: 'Demo Owner', email: 'demo-owner@example.com', password: crypto.randomBytes(24).toString('hex'), company_name: 'Demo Fashion', phone: null });
  createLicense({ client_id: ids.clientId, plan: 'BUSINESS', start_date: today(), expiry_date: addDays(today(), 365), key: 'vto_demo_localkey_0001' });
  addDomain(ids.clientId, 'localhost', true);
  addDomain(ids.clientId, '127.0.0.1', true);
  logger.info('demo_seeded', { license: 'vto_demo_localkey_0001' });
}
module.exports = { seedAdmin, seedDemo };
