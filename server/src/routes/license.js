const express = require('express');
const { ok, fail, wrap } = require('../utils/respond');
const { validatePublic, publicMessage } = require('../services/license');

const r = express.Router();

// POST /api/license/validate  { license, domain }
r.post('/validate', wrap(async (req, res) => {
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'no-store');
  const b = req.body || {};
  const result = validatePublic({ license: b.license, domain: b.domain, origin: req.get('origin'), ip: req.ip });
  if (!result.ok) return fail(res, 403, result.code, publicMessage(result.code));
  return ok(res, result.data);
}));

module.exports = r;
