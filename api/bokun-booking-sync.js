const { syncRecentBokunBookings } = require('../lib/bokun/booking-sync');
const { checkRateLimit } = require('../lib/concierge/rate-limit');
const { safeBokunError } = require('../lib/bokun/client');

function getHeader(req, name) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(req) {
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (!req.body) return {};
  try {
    return JSON.parse(req.body);
  } catch {
    return null;
  }
}

function cleanInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseOptions(req) {
  const body = req.method === 'POST' ? readBody(req) : {};
  if (body === null) return null;

  const query = req.query || {};
  return {
    lookbackHours: cleanInteger(body.lookbackHours ?? query.lookbackHours, 48, 1, 336),
    pageSize: cleanInteger(body.pageSize ?? query.pageSize, 20, 1, 50),
    maxPages: cleanInteger(body.maxPages ?? query.maxPages, 2, 1, 5),
    rangeField: body.rangeField || query.rangeField,
  };
}

function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET || process.env.BOKUN_SYNC_TOKEN || '';
  if (!secret) return false;
  return getHeader(req, 'authorization') === `Bearer ${secret}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  if (!isAuthorizedCron(req)) {
    res.status(401).json({ error: 'Unauthorized sync' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-booking-sync', max: 10, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many Bókun sync requests' });
    return;
  }

  const options = parseOptions(req);
  if (options === null) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  try {
    const result = await syncRecentBokunBookings(options, {
      clientIp: getClientIp(req),
      origin: getHeader(req, 'origin'),
      userAgent: getHeader(req, 'user-agent'),
      headers: req.headers,
    });

    console.warn(`bokun booking sync completed found=${result.totalFound} processed=${result.processedCount} failures=${result.failureCount}`);
    res.status(result.ok ? 200 : 207).json(result);
  } catch (error) {
    console.error('bokun booking sync failed', safeBokunError(error));
    res.status(502).json({ error: 'Bókun booking sync failed' });
  }
};
