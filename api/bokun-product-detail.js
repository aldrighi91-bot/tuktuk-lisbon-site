const { checkRateLimit } = require('../lib/concierge/rate-limit');
const {
  getBokunConfigStatus,
  getExperienceComponents,
  hasBokunConfig,
  missingBokunConfigKeys,
  safeBokunError,
} = require('../lib/bokun/client');

function getQueryValue(req, key) {
  try {
    return new URL(req.url, 'https://tuktuklisbon.tours').searchParams.get(key);
  } catch {
    return null;
  }
}

function cleanComponentTypes(rawTypes) {
  if (!rawTypes) return [];
  return String(rawTypes)
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  if (process.env.VERCEL_ENV === 'production') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-product-detail', max: 10, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many Bókun product detail requests' });
    return;
  }

  const configured = getBokunConfigStatus();
  if (!hasBokunConfig()) {
    res.status(200).json({
      ok: false,
      configured,
      missingKeys: missingBokunConfigKeys(),
    });
    return;
  }

  try {
    const id = getQueryValue(req, 'id');
    const componentTypes = cleanComponentTypes(getQueryValue(req, 'components'));
    const detail = await getExperienceComponents(id, componentTypes);
    res.status(200).json({
      ok: detail.ok,
      status: detail.status,
      configured,
      data: detail.data,
    });
  } catch (error) {
    console.error('bokun product detail failed', safeBokunError(error));
    res.status(200).json({
      ok: false,
      configured,
      error: safeBokunError(error),
    });
  }
};
