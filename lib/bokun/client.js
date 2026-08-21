const crypto = require('crypto');

const DEFAULT_API_BASE_URL = 'https://api.bokun.io';
const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_LANGUAGE = 'EN';

function normalizeApiBaseUrl(value = process.env.BOKUN_API_BASE_URL || DEFAULT_API_BASE_URL) {
  const rawUrl = String(value || '').trim() || DEFAULT_API_BASE_URL;
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('BOKUN_API_BASE_URL must use http or https');
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed.href.replace(/\/+$/, '');
}

function formatBokunDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-') + ' ' + [
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join(':');
}

function buildBokunSignature({ date, accessKey, secretKey, method, path }) {
  const signedContent = `${date}${accessKey}${String(method || 'GET').toUpperCase()}${path}`;
  return crypto.createHmac('sha1', secretKey).update(signedContent).digest('base64');
}

function getBokunConfigStatus() {
  return {
    accessKey: Boolean(process.env.BOKUN_ACCESS_KEY),
    secretKey: Boolean(process.env.BOKUN_SECRET_KEY),
    apiBaseUrl: Boolean(process.env.BOKUN_API_BASE_URL || DEFAULT_API_BASE_URL),
    apiBaseUrlProvided: Boolean(process.env.BOKUN_API_BASE_URL),
    bookingChannel: Boolean(process.env.BOKUN_BOOKING_CHANNEL),
  };
}

function hasBokunConfig() {
  const configured = getBokunConfigStatus();
  return configured.accessKey && configured.secretKey && configured.apiBaseUrl;
}

function missingBokunConfigKeys() {
  const configured = getBokunConfigStatus();
  return Object.entries({
    BOKUN_ACCESS_KEY: configured.accessKey,
    BOKUN_SECRET_KEY: configured.secretKey,
  })
    .filter(([, present]) => !present)
    .map(([key]) => key);
}

function getBokunApiBaseHost() {
  try {
    return new URL(normalizeApiBaseUrl()).host;
  } catch {
    return '';
  }
}

function normalizePath(path) {
  const normalized = String(path || '').trim();
  if (!normalized.startsWith('/')) {
    throw new Error('Bokun API path must start with /');
  }
  if (/^\/\//.test(normalized) || /^https?:\/\//i.test(normalized)) {
    throw new Error('Bokun API path must not be an absolute URL');
  }
  return normalized;
}

function createBokunHeaders(path, options = {}) {
  const accessKey = process.env.BOKUN_ACCESS_KEY;
  const secretKey = process.env.BOKUN_SECRET_KEY;
  const missingKeys = missingBokunConfigKeys();
  if (missingKeys.length) {
    const error = new Error(`Missing Bókun configuration: ${missingKeys.join(', ')}`);
    error.code = 'BOKUN_CONFIG_MISSING';
    error.missingKeys = missingKeys;
    throw error;
  }

  const method = String(options.method || 'GET').toUpperCase();
  const date = options.date || formatBokunDate();
  const normalizedPath = normalizePath(path);
  const signature = buildBokunSignature({
    date,
    accessKey,
    secretKey,
    method,
    path: normalizedPath,
  });

  const headers = {
    Accept: 'application/json',
    'X-Bokun-AccessKey': accessKey,
    'X-Bokun-Date': date,
    'X-Bokun-Signature': signature,
  };

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    headers['Content-Type'] = 'application/json;charset=UTF-8';
  }

  return headers;
}

function parseBokunResponse(text, contentType = '') {
  if (!text) return null;
  if (contentType.includes('application/json') || /^[\[{]/.test(text.trim())) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function bokunFetch(path, options = {}) {
  const normalizedPath = normalizePath(path);
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    ...createBokunHeaders(normalizedPath, { method }),
    ...(options.headers || {}),
  };
  const body = options.body == null
    ? undefined
    : typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);

  try {
    const response = await fetch(`${normalizeApiBaseUrl()}${normalizedPath}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      data: parseBokunResponse(text, contentType),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toNumberId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function extractActivityIds(data) {
  const ids = [];
  const add = (value) => {
    const id = toNumberId(value && typeof value === 'object' ? value.id : value);
    if (id) ids.push(id);
  };

  if (Array.isArray(data)) {
    data.forEach(add);
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.activityIds)) data.activityIds.forEach(add);
    if (Array.isArray(data.ids)) data.ids.forEach(add);
    if (Array.isArray(data.items)) data.items.forEach(add);
    if (Array.isArray(data.activities)) data.activities.forEach(add);
    if (Array.isArray(data.suppliers)) {
      data.suppliers.forEach((supplier) => {
        if (Array.isArray(supplier.activityIds)) supplier.activityIds.forEach(add);
      });
    }
  }

  return [...new Set(ids)];
}

function buildQueryPath(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickPrice(item) {
  if (!item || typeof item !== 'object') return { amount: null, currency: '' };
  if (typeof item.price === 'number') return { amount: item.price, currency: pickString(item.currency) };
  if (item.price && typeof item.price === 'object') {
    const amount = item.price.amount ?? item.price.value ?? item.price.price ?? null;
    return {
      amount: typeof amount === 'number' ? amount : null,
      currency: pickString(item.price.currency, item.currency),
    };
  }
  if (typeof item.actualPrice === 'number') {
    return { amount: item.actualPrice, currency: pickString(item.currency) };
  }
  return { amount: null, currency: pickString(item.currency) };
}

function formatDuration(item) {
  const minutes =
    item.durationMinutes ??
    item.durationInMinutes ??
    item.duration?.minutes ??
    null;
  const hours =
    item.durationHours ??
    item.duration?.hours ??
    null;
  if (Number.isFinite(minutes) && minutes > 0) return `${minutes} min`;
  if (Number.isFinite(hours) && hours > 0) return `${hours} h`;
  if (typeof item.durationText === 'string') return item.durationText.trim();
  if (typeof item.duration === 'string') return item.duration.trim();
  return '';
}

function mapActivityProduct(item, fallbackCurrency = DEFAULT_CURRENCY) {
  const product = item && typeof item === 'object' && item.product ? item.product : item;
  const id = toNumberId(product?.id ?? item?.id);
  const price = pickPrice(product || item);
  return {
    id,
    title: pickString(product?.title, product?.name, item?.title, item?.name),
    slug: pickString(product?.slug, item?.slug),
    summary: pickString(product?.summary, product?.excerpt, product?.description, item?.summary, item?.excerpt),
    duration: formatDuration(product || item || {}),
    price: price.amount,
    currency: price.currency || fallbackCurrency,
  };
}

function extractProductItems(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.activities)) return data.activities;
  if (Array.isArray(data.products)) return data.products;
  return [];
}

async function listActiveActivityIds() {
  const response = await bokunFetch('/activity.json/active-ids');
  return {
    ...response,
    ids: response.ok ? extractActivityIds(response.data) : [],
  };
}

async function listActivitiesByIds(ids, options = {}) {
  const cleanIds = [...new Set((ids || []).map(toNumberId).filter(Boolean))].slice(0, options.limit || 20);
  if (!cleanIds.length) {
    return { ok: true, status: 200, statusText: 'OK', data: { items: [] }, products: [] };
  }

  const currency = pickString(options.currency) || DEFAULT_CURRENCY;
  const lang = pickString(options.lang) || DEFAULT_LANGUAGE;
  const path = buildQueryPath('/activity.json/list-by-id', {
    ids: cleanIds.join(','),
    currency,
    lang,
  });
  const response = await bokunFetch(path);
  return {
    ...response,
    products: response.ok
      ? extractProductItems(response.data).map((item) => mapActivityProduct(item, currency)).filter((item) => item.id)
      : [],
  };
}

async function getExperienceComponents(experienceId, componentTypes = []) {
  const id = toNumberId(experienceId);
  if (!id) {
    throw new Error('A valid Bókun experience ID is required');
  }

  const search = new URLSearchParams();
  const types = Array.isArray(componentTypes) && componentTypes.length
    ? componentTypes
    : ['TITLE', 'DESCRIPTION', 'DURATION', 'BOOKING_TYPE', 'CAPACITY_TYPE', 'PRIVATE_EXPERIENCE', 'PRICING_CATEGORIES', 'RATES', 'PRICING', 'MEETING_TYPE_SETTINGS', 'DEFAULT_OPENING_HOURS'];
  types.forEach((type) => search.append('componentType', String(type).trim().toUpperCase()));
  return bokunFetch(`/restapi/v2.0/experience/${id}/components?${search.toString()}`);
}

async function updateExperienceComponents(experienceId, components) {
  const id = toNumberId(experienceId);
  if (!id) {
    throw new Error('A valid Bókun experience ID is required');
  }
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    throw new Error('Bókun experience components must be an object');
  }

  return bokunFetch(`/restapi/v2.0/experience/${id}/components`, {
    method: 'PUT',
    body: components,
    timeoutMs: 12000,
  });
}

async function createExperience(components) {
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    throw new Error('Bókun experience components must be an object');
  }

  return bokunFetch('/restapi/v2.0/experience', {
    method: 'POST',
    body: components,
    timeoutMs: 12000,
  });
}

async function getBookingByConfirmationCode(confirmationCode) {
  const id = String(confirmationCode || '').trim();
  if (!id) {
    throw new Error('A Bókun booking confirmation code or id is required');
  }

  return bokunFetch(`/booking.json/booking/${encodeURIComponent(id)}`, {
    timeoutMs: 10000,
  });
}

function safeBokunError(error) {
  return {
    code: error?.code || 'BOKUN_ERROR',
    message: error?.code === 'BOKUN_CONFIG_MISSING'
      ? error.message
      : 'Bókun API request failed',
    missingKeys: Array.isArray(error?.missingKeys) ? error.missingKeys : undefined,
  };
}

module.exports = {
  DEFAULT_API_BASE_URL,
  buildBokunSignature,
  buildQueryPath,
  bokunFetch,
  createBokunHeaders,
  createExperience,
  extractActivityIds,
  extractProductItems,
  formatBokunDate,
  getBookingByConfirmationCode,
  getExperienceComponents,
  getBokunApiBaseHost,
  getBokunConfigStatus,
  hasBokunConfig,
  listActiveActivityIds,
  listActivitiesByIds,
  mapActivityProduct,
  missingBokunConfigKeys,
  normalizeApiBaseUrl,
  safeBokunError,
  updateExperienceComponents,
};
