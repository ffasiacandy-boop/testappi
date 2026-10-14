const SENSITIVE = /pass|secret|token|hash|authorization|cookie/i;
function redact(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  return out;
}
function log(level, event, meta) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...redact(meta) });
  (level === 'error' ? console.error : console.log)(line);
}
module.exports = {
  info: (e, m) => log('info', e, m),
  warn: (e, m) => log('warn', e, m),
  error: (e, m) => log('error', e, m),
  audit: (adminId, action, meta) => log('audit', 'admin_action', { adminId, action, ...meta }),
};
