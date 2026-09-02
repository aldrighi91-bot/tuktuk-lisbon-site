const { buildLeadPayload, deliverLead, sanitizeLead, validateLead } = require('../lib/concierge/lead-store');
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
    return {};
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

  const rate = checkRateLimit(req, { prefix: 'lead', max: 8, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many lead requests' });
    return;
  }

  const body = readBody(req);
  const lead = sanitizeLead(body.lead || {});
  const errors = validateLead(lead);
  if (errors.length) {
    res.status(400).json({ error: 'Missing required fields', fields: errors });
    return;
  }

  const payload = buildLeadPayload({
    ...lead,
    sourcePath: body.sourcePath,
    qualification: body.qualification,
  });

  try {
    const delivery = await deliverLead(payload, {
      clientIp: getClientIp(req),
      origin: getHeader(req, 'origin'),
      userAgent: getHeader(req, 'user-agent'),
    });
    if (delivery.delivery === 'not_configured') {
      res.status(200).json({
        ok: false,
        error: 'Lead delivery is not configured',
        leadId: payload.id,
      });
      return;
    }

    console.warn(`concierge lead submitted id=${payload.id} qualification=${payload.qualification} delivery=${delivery.delivery}`);
    res.status(200).json({ ok: true, leadId: payload.id, delivery: delivery.delivery });
  } catch (error) {
    console.error('concierge lead delivery failed', error.message);
    res.status(502).json({ error: 'Lead delivery failed' });
  }
};
