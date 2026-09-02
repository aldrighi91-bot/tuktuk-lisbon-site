const { checkRateLimit } = require('../lib/concierge/rate-limit');
const { BOKUN_EXPERIENCE_IDS } = require('../lib/bokun/tour-sync');

function getPublicBookingChannelUuid() {
  const value = String(
    process.env.BOKUN_BOOKING_CHANNEL_UUID ||
    process.env.BOKUN_WIDGET_CHANNEL_UUID ||
    process.env.BOKUN_BOOKING_CHANNEL ||
    ''
  ).trim();

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value;
  }

  return '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-widget-config', max: 30, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many widget config requests' });
    return;
  }

  const bookingChannelUuid = getPublicBookingChannelUuid();

  res.status(200).json({
    ok: Boolean(bookingChannelUuid),
    bookingChannelUuid,
    products: BOKUN_EXPERIENCE_IDS,
    provider: 'Bokun',
  });
};
