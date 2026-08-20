const { checkRateLimit } = require('../lib/concierge/rate-limit');
const {
  getBokunApiBaseHost,
  getBokunConfigStatus,
  hasBokunConfig,
  listActiveActivityIds,
  missingBokunConfigKeys,
  safeBokunError,
} = require('../lib/bokun/client');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-status', max: 15, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many Bókun status requests' });
    return;
  }

  const configured = getBokunConfigStatus();
  const response = {
    ok: false,
    configured,
    apiBaseUrlHost: getBokunApiBaseHost(),
    readOnly: true,
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
    const active = await listActiveActivityIds();
    response.ok = active.ok;
    response.checks.push({
      name: 'active-activity-ids',
      ok: active.ok,
      status: active.status,
      activeProductCount: active.ids.length,
    });
    res.status(200).json(response);
  } catch (error) {
    console.error('bokun status check failed', safeBokunError(error));
    response.error = safeBokunError(error);
    response.checks.push({
      name: 'active-activity-ids',
      ok: false,
    });
    res.status(200).json(response);
  }
};
