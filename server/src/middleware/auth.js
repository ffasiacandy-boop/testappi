const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cfg = require('../config');
const db = require('../db');
const { AppError } = require('../utils/respond');

const COOKIE = 'vt_session';
const DAY = 864e5;

function startSession(res, user) {
  const sid = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?,?,?,?)')
    .run(sid, user.id, new Date(now.getTime() + cfg.sessionDays * DAY).toISOString(), now.toISOString());
  const token = jwt.sign({ sid, sub: user.id, role: user.role }, cfg.jwtSecret, { algorithm: 'HS256', expiresIn: `${cfg.sessionDays}d` });
  res.cookie(COOKIE, token, { httpOnly: true, secure: cfg.cookieSecure, sameSite: 'strict', maxAge: cfg.sessionDays * DAY, path: '/' });
}
function endSession(req, res) {
  if (req.session) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.session.sid);
  res.clearCookie(COOKIE, { path: '/' });
}
function authenticate(req, res, next) {
  const unauth = () => next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in.'));
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return unauth();
  let p;
  try { p = jwt.verify(token, cfg.jwtSecret, { algorithms: ['HS256'] }); } catch { return unauth(); }
  const s = db.prepare('SELECT id, user_id, expires_at FROM sessions WHERE id = ?').get(p.sid);
  if (!s || s.expires_at < new Date().toISOString()) return unauth();
  const u = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(s.user_id);
  if (!u) return unauth();
  req.user = u; req.session = { sid: s.id };
  next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.role === 'ADMIN' ? next() : next(new AppError(403, 'FORBIDDEN', 'Admin access required.')));
function requireClient(req, res, next) {
  if (!req.user || req.user.role !== 'CLIENT') return next(new AppError(403, 'FORBIDDEN', 'Client access required.'));
  const c = db.prepare('SELECT * FROM clients WHERE user_id = ?').get(req.user.id);
  if (!c) return next(new AppError(403, 'FORBIDDEN', 'No client profile.'));
  req.client = c; next();
}
// Cookie auth + SameSite=Strict already blocks cross-site requests; the custom header is defence in depth
// (a cross-origin request that adds it needs a CORS preflight, and these routes send no CORS headers).
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'vt-dashboard') return next(new AppError(403, 'CSRF', 'Invalid request.'));
  next();
}
function purgeSessions() { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString()); }

module.exports = { startSession, endSession, authenticate, requireAdmin, requireClient, csrfGuard, purgeSessions };
