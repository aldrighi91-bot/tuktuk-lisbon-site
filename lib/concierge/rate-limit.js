const buckets = new Map();

function getClientId(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

function checkRateLimit(req, options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 40;
  const now = Date.now();
  const clientId = getClientId(req);
  const key = `${options.prefix || 'default'}:${clientId}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1 };
  }

  current.count += 1;
  if (current.count > max) {
    return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { ok: true, remaining: max - current.count };
}

module.exports = { checkRateLimit };
