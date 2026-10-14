const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const logger = require('../utils/logger');
const { ok, wrap, AppError } = require('../utils/respond');
const v = require('../utils/validate');
const { authenticate, csrfGuard, startSession, endSession } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/security');
const { BCRYPT_ROUNDS } = require('../services/accounts');

const r = express.Router();
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

r.post('/login', loginLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const good = await bcrypt.compare(String(b.password || '').slice(0, 72), user ? user.password_hash : DUMMY_HASH);
  if (!user || !good) {
    logger.warn('login_failure', { email: email.slice(0, 100), ip: req.ip });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }
  if (user.role !== 'ADMIN') {   // there is no client portal: only the administrator can sign in
    logger.warn('login_non_admin_blocked', { userId: user.id, ip: req.ip });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }
  logger.info('login_success', { userId: user.id, role: user.role, ip: req.ip });
  startSession(res, user);
  ok(res, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

r.post('/logout', authenticate, csrfGuard, wrap(async (req, res) => { endSession(req, res); ok(res, {}); }));

r.get('/me', authenticate, wrap(async (req, res) => ok(res, { user: req.user })));

r.post('/change-password', authenticate, csrfGuard, wrap(async (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!(await bcrypt.compare(String(b.current_password || '').slice(0, 72), row.password_hash))) throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  const hash = await bcrypt.hash(v.reqPassword(b.new_password), BCRYPT_ROUNDS);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, v.nowIso(), req.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user.id, req.session.sid);
  logger.info('password_changed', { userId: req.user.id });
  ok(res, {});
}));

module.exports = r;
