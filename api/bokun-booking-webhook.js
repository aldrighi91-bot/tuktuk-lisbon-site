const {
  isAuthorizedWebhook,
  processBokunBookingWebhook,
} = require('../lib/bokun/booking-sync');
const { checkRateLimit } = require('../lib/concierge/rate-limit');

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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const contentLength = Number(getHeader(req, 'content-length') || '0');
  if (contentLength > 256000) {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-booking-webhook', max: 60, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many webhook requests' });
    return;
  }

  if (!isAuthorizedWebhook(req)) {
    res.status(401).json({ error: 'Unauthorized webhook' });
    return;
  }

  const body = readBody(req);
  if (!body) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  try {
    const result = await processBokunBookingWebhook(body, {
      clientIp: getClientIp(req),
      origin: getHeader(req, 'origin'),
      userAgent: getHeader(req, 'user-agent'),
      headers: req.headers,
    });

    const summary = {
      ok: result.ok,
      delivery: result.delivery,
      fetchedFromBokun: result.fetchedFromBokun,
      lookupId: result.lookupId,
      bookingReference: result.booking.bookingReference,
      tourId: result.booking.tourId,
      status: result.booking.status,
      errors: result.booking.errors,
    };

    if (!result.ok) {
      console.warn(`bokun booking webhook received but not delivered booking=${summary.bookingReference || summary.lookupId || 'unknown'} errors=${summary.errors.join(',')}`);
      res.status(200).json(summary);
      return;
    }

    console.warn(`bokun booking webhook synced booking=${summary.bookingReference || summary.lookupId || 'unknown'} delivery=${result.delivery}`);
    res.status(200).json(summary);
  } catch (error) {
    console.error('bokun booking webhook failed', {
      message: error.message,
      status: error.status,
    });
    res.status(502).json({ error: 'Bókun booking webhook failed' });
  }
};
