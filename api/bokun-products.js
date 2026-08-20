const { checkRateLimit } = require('../lib/concierge/rate-limit');
const {
  getBokunApiBaseHost,
  getBokunConfigStatus,
  hasBokunConfig,
  listActiveActivityIds,
  listActivitiesByIds,
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

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit)) return 10;
  return Math.max(1, Math.min(limit, 20));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-products', max: 10, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many Bókun product requests' });
    return;
  }

  const configured = getBokunConfigStatus();
  const response = {
    ok: false,
    configured,
    apiBaseUrlHost: getBokunApiBaseHost(),
    readOnly: true,
    activeProductCount: 0,
    fetchedProductCount: 0,
    products: [],
    checks: [],
  };

  if (!hasBokunConfig()) {
    response.checks.push({
      name: 'configuration',
      ok: false,
      missingKeys: missingBokunConfigKeys(),
    });
    res.status(200).json(response);
    return;
  }

  try {
    const limit = parseLimit(getQueryValue(req, 'limit'));
    const active = await listActiveActivityIds();
    response.activeProductCount = active.ids.length;
    response.checks.push({
      name: 'active-activity-ids',
      ok: active.ok,
      status: active.status,
    });

    if (!active.ok) {
      res.status(200).json(response);
      return;
    }

    const details = await listActivitiesByIds(active.ids, {
      limit,
      currency: getQueryValue(req, 'currency') || 'EUR',
      lang: getQueryValue(req, 'lang') || 'EN',
    });
    response.ok = details.ok;
    response.products = details.products;
    response.fetchedProductCount = details.products.length;
    response.checks.push({
      name: 'activity-list-by-id',
      ok: details.ok,
      status: details.status,
    });
    res.status(200).json(response);
  } catch (error) {
    console.error('bokun product read failed', safeBokunError(error));
    response.error = safeBokunError(error);
    res.status(200).json(response);
  }
};
