const { checkRateLimit } = require('../lib/concierge/rate-limit');
const {
  createExperience,
  getBokunConfigStatus,
  getExperienceComponents,
  hasBokunConfig,
  missingBokunConfigKeys,
  safeBokunError,
  updateExperienceComponents,
} = require('../lib/bokun/client');
const {
  BOKUN_EXPERIENCE_IDS,
  DEFAULT_ALFAMA_EXPERIENCE_ID,
  SYNC_CONFIRMATION,
  buildActivationPayload,
  buildAlfamaUpdatePayload,
  buildContactInfoUpdatePayload,
  buildCreateDraftPayload,
  buildTourSyncPlan,
  getOfficialTours,
} = require('../lib/bokun/tour-sync');

const TEMPLATE_COMPONENTS = [
  'ID',
  'TITLE',
  'TYPE',
  'CATEGORIES',
  'LOCATION',
  'DIFFICULTY_LEVEL',
  'MIN_AGE',
  'DURATION',
  'PRIVATE_EXPERIENCE',
  'GUIDANCE_TYPES',
  'KNOW_BEFORE_YOU_GO',
  'BOOKING_TYPE',
  'DEFAULT_OPENING_HOURS',
  'CUTOFF',
  'CAPACITY_TYPE',
  'PRICING_CATEGORIES',
  'RATES',
  'PRICING',
  'MAIN_PAX_INFO',
  'OTHER_PAX_INFO',
  'MEETING_TYPE',
  'BOX_SETTINGS',
  'COMBO',
  'TICKET',
  'BOOKING_LABELS',
  'FLAGS',
  'ALLOW_CUSTOMIZED_BOOKINGS',
  'EARLY_BOOKING_LIMIT',
];

const ALLOWED_ACTIONS = new Set(['update-alfama', 'create-drafts', 'update-draft-contact', 'activate-drafts']);

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (!req.body) return {};
  if (typeof req.body === 'string' && req.body.length > 4096) return {};
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function toNumberId(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return fallback;
}

function normalizeActions(rawActions) {
  const actions = Array.isArray(rawActions) ? rawActions : ['update-alfama'];
  return [...new Set(actions.map((action) => String(action || '').trim()).filter((action) => ALLOWED_ACTIONS.has(action)))];
}

function summarizePayload(payload) {
  return {
    title: payload.title,
    externalId: payload.externalId,
    duration: payload.duration,
    bookingType: payload.bookingType,
    capacityType: payload.capacityType,
    activation: payload.activation,
    defaultOpeningHours: payload.defaultOpeningHours ? '08:00-22:00 every day' : undefined,
    rate: payload.rates?.rates?.[0] ? {
      externalId: payload.rates.rates[0].externalId,
      title: payload.rates.rates[0].title,
      minPerBooking: payload.rates.rates[0].minPerBooking,
      maxPerBooking: payload.rates.rates[0].maxPerBooking,
      pricedPerPerson: payload.rates.rates[0].pricedPerPerson,
    } : undefined,
    price: payload.pricing?.experiencePriceRules?.[0] ? {
      amount: payload.pricing.experiencePriceRules[0].amount,
      currency: payload.pricing.experiencePriceRules[0].currency,
      priceCatalogId: payload.pricing.experiencePriceRules[0].priceCatalogId,
      perBooking: !payload.pricing.experiencePriceRules[0].pricingCategoryId,
    } : undefined,
  };
}

function buildActionResponse({ tourId, action, payload, response, includePayload }) {
  const body = {
    tourId,
    action,
    ok: Boolean(response?.ok),
    status: response?.status,
    summary: summarizePayload(payload),
  };
  if (response?.data?.id) body.experienceId = response.data.id;
  if (!response?.ok) body.error = response?.data || { statusText: response?.statusText };
  if (includePayload) body.payload = payload;
  return body;
}

async function getTemplateComponents(existingAlfamaId) {
  const response = await getExperienceComponents(existingAlfamaId, TEMPLATE_COMPONENTS);
  if (!response.ok) {
    const error = new Error('Could not read current Alfama product from Bókun');
    error.response = response;
    throw error;
  }
  return response.data || {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (process.env.VERCEL_ENV === 'production') {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'bokun-tour-sync', max: 8, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many Bókun sync requests' });
    return;
  }

  const body = req.method === 'POST' ? readBody(req) : {};
  const existingAlfamaId = toNumberId(body.existingAlfamaId, DEFAULT_ALFAMA_EXPERIENCE_ID);
  const plan = buildTourSyncPlan({ existingAlfamaId });
  const configured = getBokunConfigStatus();

  if (req.method === 'GET') {
    res.status(200).json({ ok: true, configured, dryRunOnly: true, plan });
    return;
  }

  if (body.confirm !== SYNC_CONFIRMATION) {
    res.status(403).json({
      error: 'Missing confirmation',
      requiredConfirm: SYNC_CONFIRMATION,
      plan,
    });
    return;
  }

  if (!hasBokunConfig()) {
    res.status(200).json({
      ok: false,
      configured,
      missingKeys: missingBokunConfigKeys(),
      plan,
    });
    return;
  }

  const actions = normalizeActions(body.actions);
  if (!actions.length) {
    res.status(400).json({ error: 'No valid sync actions were requested', allowedActions: [...ALLOWED_ACTIONS] });
    return;
  }

  const dryRun = body.dryRun !== false;
  const includePayload = body.includePayload === true;

  try {
    const template = await getTemplateComponents(existingAlfamaId);
    const results = {
      ok: true,
      dryRun,
      configured,
      plan,
      results: [],
    };

    if (actions.includes('update-alfama')) {
      const payload = buildAlfamaUpdatePayload(template);
      if (dryRun) {
        results.results.push({
          tourId: 'alfama',
          action: 'update_existing_product',
          experienceId: existingAlfamaId,
          dryRun: true,
          summary: summarizePayload(payload),
          ...(includePayload ? { payload } : {}),
        });
      } else {
        const response = await updateExperienceComponents(existingAlfamaId, payload);
        results.results.push(buildActionResponse({
          tourId: 'alfama',
          action: 'update_existing_product',
          payload,
          response,
          includePayload,
        }));
      }
    }

    if (actions.includes('create-drafts')) {
      const tours = getOfficialTours().filter((tour) => tour.id !== 'alfama');
      for (const tour of tours) {
        const payload = buildCreateDraftPayload(tour, template);
        if (dryRun) {
          results.results.push({
            tourId: tour.id,
            action: 'create_inactive_on_request_product',
            dryRun: true,
            summary: summarizePayload(payload),
            ...(includePayload ? { payload } : {}),
          });
        } else {
          const response = await createExperience(payload);
          results.results.push(buildActionResponse({
            tourId: tour.id,
            action: 'create_inactive_on_request_product',
            payload,
            response,
            includePayload,
          }));
        }
      }
    }

    if (actions.includes('update-draft-contact')) {
      const payload = buildContactInfoUpdatePayload();
      const tours = getOfficialTours().filter((tour) => tour.id !== 'alfama');
      for (const tour of tours) {
        const experienceId = BOKUN_EXPERIENCE_IDS[tour.id];
        if (dryRun) {
          results.results.push({
            tourId: tour.id,
            action: 'update_draft_contact_fields',
            experienceId,
            dryRun: true,
            summary: {
              mainPaxInfo: payload.mainPaxInfo.map((field) => field.type),
              otherPaxInfo: payload.otherPaxInfo.map((field) => field.type),
            },
            ...(includePayload ? { payload } : {}),
          });
        } else {
          const response = await updateExperienceComponents(experienceId, payload);
          results.results.push({
            tourId: tour.id,
            action: 'update_draft_contact_fields',
            experienceId,
            ok: Boolean(response.ok),
            status: response.status,
            summary: {
              mainPaxInfo: payload.mainPaxInfo.map((field) => field.type),
              otherPaxInfo: payload.otherPaxInfo.map((field) => field.type),
            },
            ...(!response.ok ? { error: response.data || { statusText: response.statusText } } : {}),
            ...(includePayload ? { payload } : {}),
          });
        }
      }
    }

    if (actions.includes('activate-drafts')) {
      const payload = buildActivationPayload(true);
      const tours = getOfficialTours().filter((tour) => tour.id !== 'alfama');
      for (const tour of tours) {
        const experienceId = BOKUN_EXPERIENCE_IDS[tour.id];
        if (dryRun) {
          results.results.push({
            tourId: tour.id,
            action: 'activate_draft_product',
            experienceId,
            dryRun: true,
            summary: payload.activation,
            ...(includePayload ? { payload } : {}),
          });
        } else {
          const response = await updateExperienceComponents(experienceId, payload);
          results.results.push({
            tourId: tour.id,
            action: 'activate_draft_product',
            experienceId,
            ok: Boolean(response.ok),
            status: response.status,
            summary: payload.activation,
            ...(!response.ok ? { error: response.data || { statusText: response.statusText } } : {}),
            ...(includePayload ? { payload } : {}),
          });
        }
      }
    }

    if (results.results.some((item) => !item.ok && !item.dryRun)) {
      results.ok = false;
    }

    res.status(200).json(results);
  } catch (error) {
    console.error('bokun tour sync failed', safeBokunError(error));
    res.status(200).json({
      ok: false,
      configured,
      plan,
      error: error.response?.data || safeBokunError(error),
    });
  }
};
