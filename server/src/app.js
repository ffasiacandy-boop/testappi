const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cfg = require('./config');
const { fail, errorHandler } = require('./utils/respond');
const { validateLimiter, publicCors, dashboardHelmet } = require('./middleware/security');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', cfg.trustProxy);

// --- Public, CSP-free assets: hosted SDK and demo site -------------------------------------------------
const distDir = path.join(cfg.root, 'sdk', 'dist');
app.get('/cdn/vto.js', (req, res) => {
  const file = path.join(distDir, cfg.isProd ? 'vto.min.js' : 'vto.js');
  if (!fs.existsSync(file)) return res.status(404).type('text/plain').send('SDK not built. Run: npm run build:sdk');
  res.set({ 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  res.type('application/javascript').sendFile(file);
});
app.use('/demo', helmet({ contentSecurityPolicy: false, hsts: false }), express.static(path.join(cfg.root, 'demo')));

// --- API --------------------------------------------------------------------------------------------------
app.use('/api', express.json({ limit: '20kb' }), cookieParser());
app.use('/api/license', publicCors, validateLimiter, require('./routes/license'));
app.use('/api', helmet({ contentSecurityPolicy: false, hsts: cfg.isProd }), (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => fail(res, 404, 'NOT_FOUND', 'Not found.'));

// --- Dashboards (strict CSP) -----------------------------------------------------------------------------
app.use('/admin', dashboardHelmet, express.static(path.join(cfg.root, 'admin')));
app.get('/', (req, res) => res.redirect('/admin/'));

app.use(errorHandler);
module.exports = app;
