const { checkRateLimit } = require('../lib/concierge/rate-limit');
const {
  BOKUN_EXPERIENCE_IDS,
} = require('../lib/bokun/tour-sync');
const {
  bokunFetch,
  getBokunConfigStatus,
  hasBokunConfig,
  missingBokunConfigKeys,
  safeBokunError,
} = require('../lib/bokun/client');

const RESOURCE_ENDPOINTS = [
  '/restapi/v2.0/resources',
  '/restapi/v2.0/resource/pools',
];

async function readBokun(path) {
  const response = await bokunFetch(path, { timeoutMs: 12000 });
  return {
    path,
    ok: response.ok,
    status: response.status,
    data: response.data,
  };
}

async function inspectResourceState() {
  const results = [];
  for (const path of RESOURCE_ENDPOINTS) {
    results.push(await readBokun(path));
  }

  for (const [tourId, experienceId] of Object.entries(BOKUN_EXPERIENCE_IDS)) {
    results.push({
      tourId,
      experienceId,
      ...(await readBokun(`/restapi/v2.0/experience/${experienceId}/allocations`)),
    });
  }

  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (process.env.VERCEL_ENV === 'production') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-resource-sync', max: 8, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many Bókun resource sync requests' });
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
    const checks = await inspectResourceState();
    res.status(200).json({
      ok: checks.every((check) => check.ok),
      configured,
      readOnly: true,
      checks,
    });
  } catch (error) {
    console.error('bokun resource sync failed', safeBokunError(error));
    res.status(200).json({
      ok: false,
      configured,
      error: safeBokunError(error),
    });
  }
};
