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
  '/restapi/v2.0/resources?pageNo=0&pageSize=100',
  '/restapi/v2.0/resource/pools?pageNo=0&pageSize=100',
  '/restapi/v2.0/allocations?pageNo=0&pageSize=100',
];

const RESOURCE_PLAN = [
  { key: 'tukTuk1', title: 'Tuk Tuk 1', capacity: 6 },
  { key: 'tukTuk2', title: 'Tuk Tuk 2', capacity: 6 },
  { key: 'van', title: 'Van', capacity: 8 },
];

const RESOURCE_POOL_PLAN = [
  {
    key: 'tukTuks',
    title: 'Online Tuk Tuk Fleet',
    resourceTitles: ['Tuk Tuk 1', 'Tuk Tuk 2'],
  },
  {
    key: 'van',
    title: 'Online Van Fleet',
    resourceTitles: ['Van'],
  },
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

function getItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getTitle(item) {
  return String(item?.title || item?.name || '').trim();
}

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function summarizeResource(item) {
  return {
    id: item?.id,
    title: getTitle(item),
    capacity: item?.capacity,
    resourcePoolIds: Array.isArray(item?.resourcePoolIds) ? item.resourcePoolIds : undefined,
  };
}

function summarizePool(item) {
  return {
    id: item?.id,
    title: getTitle(item),
    resourceIds: Array.isArray(item?.resourceIds)
      ? item.resourceIds
      : Array.isArray(item?.resources)
        ? item.resources.map((resource) => resource?.id).filter(Boolean)
        : undefined,
  };
}

async function listResources() {
  const response = await readBokun('/restapi/v2.0/resources?pageNo=0&pageSize=100');
  if (!response.ok) return { response, items: [] };
  return { response, items: getItems(response.data) };
}

async function listPools() {
  const response = await readBokun('/restapi/v2.0/resource/pools?pageNo=0&pageSize=100');
  if (!response.ok) return { response, items: [] };
  return { response, items: getItems(response.data) };
}

async function tryCreateResource(resource) {
  const attempts = [
    { title: resource.title, capacity: resource.capacity },
    { title: resource.title },
  ];

  const responses = [];
  for (const body of attempts) {
    const response = await bokunFetch('/restapi/v2.0/resource', {
      method: 'POST',
      body,
      timeoutMs: 12000,
    });
    responses.push({
      ok: response.ok,
      status: response.status,
      body,
      data: response.data,
    });
    if (response.ok) return { response, responses };
  }

  return { response: responses[responses.length - 1], responses };
}

async function ensureResources() {
  const before = await listResources();
  if (!before.response.ok) {
    return {
      ok: false,
      stage: 'list_resources_before',
      response: before.response,
    };
  }

  const actions = [];
  const known = new Map(before.items.map((item) => [normalizeTitle(getTitle(item)), item]));

  for (const resource of RESOURCE_PLAN) {
    const existing = known.get(normalizeTitle(resource.title));
    if (existing) {
      actions.push({
        key: resource.key,
        title: resource.title,
        action: 'existing',
        resource: summarizeResource(existing),
      });
      continue;
    }

    const created = await tryCreateResource(resource);
    actions.push({
      key: resource.key,
      title: resource.title,
      action: 'created',
      ok: Boolean(created.response?.ok),
      status: created.response?.status,
      resource: summarizeResource(created.response?.data),
      attempts: created.responses.map((item) => ({
        ok: item.ok,
        status: item.status,
        bodyKeys: Object.keys(item.body),
        data: item.ok ? summarizeResource(item.data) : item.data,
      })),
    });

    if (created.response?.ok) {
      known.set(normalizeTitle(resource.title), created.response.data);
    }
  }

  const after = await listResources();
  return {
    ok: actions.every((action) => action.action === 'existing' || action.ok) && after.response.ok,
    stage: 'ensure_resources',
    actions,
    resources: getItems(after.response.data).map(summarizeResource),
  };
}

async function tryCreatePool(pool, resourceIds) {
  const attempts = [
    { title: pool.title, resourceIds },
    { title: pool.title, resources: resourceIds.map((id) => ({ id })) },
    { title: pool.title },
  ];

  const responses = [];
  for (const body of attempts) {
    const response = await bokunFetch('/restapi/v2.0/resource/pool', {
      method: 'POST',
      body,
      timeoutMs: 12000,
    });
    responses.push({
      ok: response.ok,
      status: response.status,
      body,
      data: response.data,
    });
    if (response.ok) return { response, responses };
  }

  return { response: responses[responses.length - 1], responses };
}

async function ensurePools() {
  const resources = await listResources();
  if (!resources.response.ok) {
    return {
      ok: false,
      stage: 'list_resources_for_pools',
      response: resources.response,
    };
  }

  const pools = await listPools();
  if (!pools.response.ok) {
    return {
      ok: false,
      stage: 'list_pools_before',
      response: pools.response,
    };
  }

  const resourcesByTitle = new Map(resources.items.map((item) => [normalizeTitle(getTitle(item)), item]));
  const poolsByTitle = new Map(pools.items.map((item) => [normalizeTitle(getTitle(item)), item]));
  const actions = [];

  for (const pool of RESOURCE_POOL_PLAN) {
    const resourceIds = pool.resourceTitles
      .map((title) => resourcesByTitle.get(normalizeTitle(title))?.id)
      .filter(Boolean);
    if (resourceIds.length !== pool.resourceTitles.length) {
      actions.push({
        key: pool.key,
        title: pool.title,
        action: 'missing_resources',
        resourceTitles: pool.resourceTitles,
        resourceIds,
      });
      continue;
    }

    const existing = poolsByTitle.get(normalizeTitle(pool.title));
    if (existing) {
      actions.push({
        key: pool.key,
        title: pool.title,
        action: 'existing',
        pool: summarizePool(existing),
      });
      continue;
    }

    const created = await tryCreatePool(pool, resourceIds);
    actions.push({
      key: pool.key,
      title: pool.title,
      action: 'created',
      ok: Boolean(created.response?.ok),
      status: created.response?.status,
      pool: summarizePool(created.response?.data),
      attempts: created.responses.map((item) => ({
        ok: item.ok,
        status: item.status,
        bodyKeys: Object.keys(item.body),
        data: item.ok ? summarizePool(item.data) : item.data,
      })),
    });
  }

  const after = await listPools();
  return {
    ok: actions.every((action) => action.action === 'existing' || action.ok) && after.response.ok,
    stage: 'ensure_pools',
    actions,
    pools: getItems(after.response.data).map(summarizePool),
  };
}

async function probeAllocationSchema() {
  const response = await bokunFetch('/restapi/v2.0/allocation', {
    method: 'POST',
    body: { __schemaProbe: true },
    timeoutMs: 12000,
  });
  return {
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
    for (const suffix of ['', '?pageNo=0&pageSize=100']) {
      results.push({
        tourId,
        experienceId,
        ...(await readBokun(`/restapi/v2.0/experience/${experienceId}/allocations${suffix}`)),
      });
    }
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
    const url = new URL(req.url || '/', 'https://tuktuklisbon.tours');
    const action = String(url.searchParams.get('action') || 'inspect').trim();
    if (action === 'ensure-resources') {
      const result = await ensureResources();
      res.status(200).json({
        ok: result.ok,
        configured,
        readOnly: false,
        result,
      });
      return;
    }
    if (action === 'ensure-pools') {
      const result = await ensurePools();
      res.status(200).json({
        ok: result.ok,
        configured,
        readOnly: false,
        result,
      });
      return;
    }
    if (action === 'probe-allocation') {
      const result = await probeAllocationSchema();
      res.status(200).json({
        ok: false,
        configured,
        readOnly: true,
        result,
      });
      return;
    }

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
