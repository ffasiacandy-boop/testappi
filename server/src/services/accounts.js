const bcrypt = require('bcryptjs');
const db = require('../db');
const { AppError } = require('../utils/respond');
const { nowIso } = require('../utils/validate');

const BCRYPT_ROUNDS = 12;

async function createClientAccount({ name, email, password, company_name, phone }) {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = nowIso();
  return db.transaction(() => {
    const u = db.prepare('INSERT INTO users (name, email, password_hash, role, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(name, email, hash, 'CLIENT', now, now);
    const c = db.prepare('INSERT INTO clients (user_id, company_name, phone, created_at, updated_at) VALUES (?,?,?,?,?)').run(u.lastInsertRowid, company_name, phone, now, now);
    return { userId: u.lastInsertRowid, clientId: c.lastInsertRowid };
  })();
}

function addDomain(clientId, domain, verified) {
  try {
    const r = db.prepare('INSERT INTO domains (client_id, domain, verified, created_at) VALUES (?,?,?,?)').run(clientId, domain, verified ? 1 : 0, nowIso());
    return db.prepare('SELECT * FROM domains WHERE id = ?').get(r.lastInsertRowid);
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new AppError(409, 'DOMAIN_EXISTS', 'That domain is already added.');
    throw e;
  }
}

module.exports = { createClientAccount, addDomain, BCRYPT_ROUNDS };
