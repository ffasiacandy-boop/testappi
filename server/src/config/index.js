const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.env') });

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';
const bool = (v, d) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');
const weak = (v) => !v || /CHANGE_THIS/i.test(v);

const cfg = {
  env, isProd, root,
  port: Number(process.env.PORT) || 4000,
  dbPath: path.resolve(root, process.env.DATABASE_URL || './data/database.sqlite'),
  jwtSecret: process.env.JWT_SECRET || '',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sdkApiUrl: (process.env.SDK_API_URL || '').replace(/\/$/, ''),
  sdkCdnUrl: (process.env.SDK_CDN_URL || '').replace(/\/$/, ''),
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
  trustProxy: process.env.TRUST_PROXY ? (isNaN(process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY)) : false,
  seedDemo: bool(process.env.SEED_DEMO, !isProd),
  sessionDays: 7,
};

if (isProd) {
  if (weak(cfg.jwtSecret) || cfg.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to a random value of 32+ characters in production.');
  if (!cfg.adminEmail || weak(cfg.adminPassword)) throw new Error('ADMIN_EMAIL and a strong ADMIN_PASSWORD must be set in production.');
} else {
  if (weak(cfg.jwtSecret)) {
    cfg.jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[config] JWT_SECRET not set - using a random one for this run (sessions reset on restart).');
  }
  if (!cfg.adminEmail) cfg.adminEmail = 'admin@example.com';
  if (!cfg.adminPassword) { cfg.adminPassword = 'CHANGE_THIS_PASSWORD'; console.warn('[config] ADMIN_PASSWORD not set - using the development placeholder.'); }
}
module.exports = cfg;
