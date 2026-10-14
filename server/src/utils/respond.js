const logger = require('./logger');

class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const ok = (res, data = {}, status = 200) => res.status(status).json({ success: true, data });
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) return fail(res, err.status, err.code, err.message);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'BAD_JSON', 'Malformed request body.');
  if (err.type === 'entity.too.large') return fail(res, 413, 'TOO_LARGE', 'Request body too large.');
  logger.error('unhandled_error', { path: req.path, message: err.message, stack: err.stack });
  return fail(res, 500, 'SERVER_ERROR', 'Something went wrong.');
}
module.exports = { AppError, ok, fail, wrap, errorHandler };
