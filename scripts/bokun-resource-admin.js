const {
  bokunFetch,
} = require('../lib/bokun/client');
const {
  BOKUN_EXPERIENCE_IDS,
} = require('../lib/bokun/tour-sync');

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

function getItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function titleOf(item) {
  return String(item?.title || item?.name || '').trim();
}

function normalizeTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function summarizeResource(item) {
  return {
    id: item?.id,
    title: titleOf(item),
    capacity: item?.capacity,
    resourcePoolIds: Array.isArray(item?.resourcePoolIds) ? item.resourcePoolIds : undefined,
  };
}

function summarizePool(item) {
  return {
    id: item?.id,
    title: titleOf(item),
    resourceIds: Array.isArray(item?.resourceIds)
      ? item.resourceIds
      : Array.isArray(item?.resources)
        ? item.resources.map((resource) => resource?.id).filter(Boolean)
        : undefined,
  };
}

async function request(path, options = {}) {
  const response = await bokunFetch(path, { timeoutMs: 15000, ...options });
  return {
    ok: response.ok,
    status: response.status,
    data: response.data,
  };
}

async function listResources() {
  const response = await request('/restapi/v2.0/resources?pageNo=0&pageSize=100');
  return { response, items: response.ok ? getItems(response.data) : [] };
}

async function listPools() {
  const response = await request('/restapi/v2.0/resource/pools?pageNo=0&pageSize=100');
  return { response, items: response.ok ? getItems(response.data) : [] };
}

async function ensureResources() {
  const before = await listResources();
  const known = new Map(before.items.map((item) => [normalizeTitle(titleOf(item)), item]));
  const actions = [];

  for (const resource of RESOURCE_PLAN) {
    const existing = known.get(normalizeTitle(resource.title));
    if (existing) {
      actions.push({ key: resource.key, action: 'existing', resource: summarizeResource(existing) });
      continue;
    }

    const response = await request('/restapi/v2.0/resource', {
      method: 'POST',
      body: { title: resource.title, capacity: resource.capacity },
    });
    actions.push({
      key: resource.key,
      action: 'created',
      ok: response.ok,
      status: response.status,
      resource: response.ok ? summarizeResource(response.data) : undefined,
      error: response.ok ? undefined : response.data,
    });
  }

  return { ok: actions.every((item) => item.action === 'existing' || item.ok), actions };
}

async function ensurePools() {
  const resources = await listResources();
  const pools = await listPools();
  const resourcesByTitle = new Map(resources.items.map((item) => [normalizeTitle(titleOf(item)), item]));
  const poolsByTitle = new Map(pools.items.map((item) => [normalizeTitle(titleOf(item)), item]));
  const actions = [];

  for (const pool of RESOURCE_POOL_PLAN) {
    const existing = poolsByTitle.get(normalizeTitle(pool.title));
    if (existing) {
      actions.push({ key: pool.key, action: 'existing', pool: summarizePool(existing) });
      continue;
    }

    const resourceIds = pool.resourceTitles
      .map((title) => resourcesByTitle.get(normalizeTitle(title))?.id)
      .filter(Boolean);
    const response = await request('/restapi/v2.0/resource/pool', {
      method: 'POST',
      body: { title: pool.title, resourceIds },
    });
    actions.push({
      key: pool.key,
      action: 'created',
      ok: response.ok,
      status: response.status,
      pool: response.ok ? summarizePool(response.data) : undefined,
      error: response.ok ? undefined : response.data,
    });
  }

  return { ok: actions.every((item) => item.action === 'existing' || item.ok), actions };
}

async function inspect() {
  const resources = await listResources();
  const pools = await listPools();
  const allocations = await request('/restapi/v2.0/allocations?pageNo=0&pageSize=100');
  return {
    resources: resources.items.map(summarizeResource),
    pools: pools.items.map(summarizePool),
    allocations: allocations.data,
  };
}

async function probeAllocation() {
  return request('/restapi/v2.0/allocation', {
    method: 'POST',
    body: { __schemaProbe: true },
  });
}

async function main() {
  const action = process.argv[2] || 'inspect';
  let result;
  if (action === 'ensure-resources') result = await ensureResources();
  else if (action === 'ensure-pools') result = await ensurePools();
  else if (action === 'probe-allocation') result = await probeAllocation();
  else result = await inspect();

  console.log(JSON.stringify({
    action,
    result,
    products: BOKUN_EXPERIENCE_IDS,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message, code: error.code }, null, 2));
  process.exit(1);
});
