const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildBokunSignature,
  buildQueryPath,
  createBokunHeaders,
  extractActivityIds,
  mapActivityProduct,
} = require('../lib/bokun/client');

function withEnv(env, callback) {
  const original = {};
  Object.keys(env).forEach((key) => {
    original[key] = process.env[key];
    if (env[key] == null) delete process.env[key];
    else process.env[key] = env[key];
  });

  try {
    return callback();
  } finally {
    Object.entries(original).forEach(([key, value]) => {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

test('builds the Bókun HMAC signature from the official example', () => {
  const signature = buildBokunSignature({
    date: '2013-11-09 14:33:46',
    accessKey: 'de235a6a15c340b6b1e1cb5f3687d04a',
    secretKey: '23e2c7da7f7048e5b46f96bc91324800',
    method: 'POST',
    path: '/activity.json/search?lang=EN&currency=ISK',
  });
  assert.equal(signature, 'XrOiTYa9Y34zscnLCsAEh8ieoyo=');
});

test('creates signed Bókun headers without exposing the secret key', () => withEnv({
  BOKUN_ACCESS_KEY: 'access-key',
  BOKUN_SECRET_KEY: 'secret-key',
}, () => {
  const headers = createBokunHeaders('/activity.json/active-ids', {
    method: 'GET',
    date: '2026-08-20 10:00:00',
  });

  assert.equal(headers['X-Bokun-AccessKey'], 'access-key');
  assert.equal(headers['X-Bokun-Date'], '2026-08-20 10:00:00');
  assert.match(headers['X-Bokun-Signature'], /^[A-Za-z0-9+/]+=*$/);
  assert.equal(Object.values(headers).includes('secret-key'), false);
}));

test('requires Bókun credentials before signing requests', () => withEnv({
  BOKUN_ACCESS_KEY: null,
  BOKUN_SECRET_KEY: null,
}, () => {
  assert.throws(
    () => createBokunHeaders('/activity.json/active-ids'),
    /Missing Bókun configuration/
  );
}));

test('extracts active activity IDs from Bókun supplier payloads', () => {
  const ids = extractActivityIds({
    suppliers: [
      { supplierId: 1, activityIds: [101, 102] },
      { supplierId: 2, activityIds: [102, '103'] },
    ],
  });
  assert.deepEqual(ids, [101, 102, 103]);
});

test('builds signed query paths with the same path that will be requested', () => {
  assert.equal(
    buildQueryPath('/activity.json/list-by-id', { ids: '101,102', currency: 'EUR', lang: 'EN' }),
    '/activity.json/list-by-id?ids=101%2C102&currency=EUR&lang=EN'
  );
});

test('maps Bókun search items to a safe product summary', () => {
  const product = mapActivityProduct({
    product: {
      id: 101,
      title: 'Lisbon Private Electric Tuk-Tuk Tour: Alfama & Scenic Viewpoints',
      slug: 'alfama-tour',
      summary: 'Historic Lisbon by private tuk tuk.',
      price: 190,
      durationHours: 1.5,
    },
  }, 'EUR');

  assert.deepEqual(product, {
    id: 101,
    title: 'Lisbon Private Electric Tuk-Tuk Tour: Alfama & Scenic Viewpoints',
    slug: 'alfama-tour',
    summary: 'Historic Lisbon by private tuk tuk.',
    duration: '1.5 h',
    price: 190,
    currency: 'EUR',
  });
});
