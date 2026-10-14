const { AppError } = require('./respond');

const CONTROL = /[\u0000-\u001f\u007f]/g;
const clean = (v) => (typeof v === 'string' ? v.replace(CONTROL, '').trim() : v);
const bad = (msg) => new AppError(400, 'VALIDATION_ERROR', msg);

function reqString(v, field, { min = 1, max = 200, allowAngle = false } = {}) {
  const s = clean(v);
  if (typeof s !== 'string' || s.length < min || s.length > max) throw bad(`${field} must be ${min}-${max} characters.`);
  if (!allowAngle && /[<>]/.test(s)) throw bad(`${field} contains invalid characters.`);
  return s;
}
function optString(v, field, opts = {}) {
  if (v === undefined || v === null || clean(v) === '') return null;
  return reqString(v, field, opts);
}
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
function reqEmail(v) {
  const s = clean(v);
  if (typeof s !== 'string' || s.length > 254 || !EMAIL.test(s)) throw bad('Please enter a valid email address.');
  return s.toLowerCase();
}
function reqPassword(v) {
  if (typeof v !== 'string' || v.length < 8 || v.length > 72) throw bad('Password must be 8-72 characters.');
  return v;
}
function reqUrl(v, field) {
  const s = clean(v);
  if (typeof s !== 'string' || s.length > 2048) throw bad(`${field} must be a valid URL.`);
  let u; try { u = new URL(s); } catch { throw bad(`${field} must be a valid URL.`); }
  if (!['http:', 'https:'].includes(u.protocol)) throw bad(`${field} must start with http:// or https://`);
  return u.toString();
}
function reqInt(v, field, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} must be a whole number between ${min} and ${max}.`);
  return n;
}
function reqDate(v, field) {
  const s = clean(v);
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad(`${field} must be a date (YYYY-MM-DD).`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw bad(`${field} is not a valid date.`);
  return s;
}
function reqId(v, field = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw bad(`Invalid ${field}.`);
  return n;
}
const PRODUCT_ID = /^[A-Za-z0-9._-]{1,64}$/;
function reqProductId(v) {
  const s = clean(v);
  if (typeof s !== 'string' || !PRODUCT_ID.test(s)) throw bad('Product ID may only contain letters, numbers, dot, dash and underscore (max 64).');
  return s;
}
// API key format: vto_ + 8-64 lowercase letters/digits/underscore (generated keys are vto_ + 32 hex chars).
const API_KEY = /^vto_[a-z0-9_]{8,64}$/;
function normalizeLicenseKey(v) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return API_KEY.test(s) ? s : null;
}
// "https://WWW.Shop.com:443/path" -> "www.shop.com". www. is NOT stripped: allowed domains are exact hosts.
function normalizeDomain(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s || s.length > 255) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/^[^@]*@/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (s === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s;
  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) return null;
  return s;
}
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nowIso = () => new Date().toISOString();

module.exports = { reqString, optString, reqEmail, reqPassword, reqUrl, reqInt, reqDate, reqId, reqProductId, normalizeLicenseKey, normalizeDomain, today, addDays, nowIso, bad };
