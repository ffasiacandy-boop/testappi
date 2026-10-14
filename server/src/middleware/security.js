const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const cfg = require('../config');
const { fail } = require('../utils/respond');

const limiter = (windowMs, max, code, msg, extra = {}) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => fail(res, 429, code, msg), ...extra,
});

const loginLimiter = limiter(15 * 60 * 1000, 10, 'RATE_LIMITED', 'Too many attempts. Please try again later.', { skipSuccessfulRequests: true });
const validateLimiter = limiter(60 * 1000, 120, 'RATE_LIMITED', 'Virtual Try-On is currently unavailable.');

// Dashboards: strict CSP (no inline script/style). The demo page and SDK file are mounted before this.
const dashboardHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"],
      baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
    },
  },
  hsts: cfg.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
});

// Public license endpoint: any origin may call it; authority is the backend domain check, not CORS.
const publicCors = cors({ origin: true, methods: ['POST', 'OPTIONS'], allowedHeaders: ['Content-Type'], maxAge: 600 });

module.exports = { loginLimiter, validateLimiter, dashboardHelmet, publicCors };
