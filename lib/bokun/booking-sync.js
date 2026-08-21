const crypto = require('crypto');
const tourData = require('../../data/tours.json');
const { getBookingByConfirmationCode } = require('./client');
const { postSupabaseEdgeFunction } = require('../concierge/lead-store');

const DEFAULT_PICKUP = 'Pickup details to confirm after booking';
const DEFAULT_TIME = 'To be confirmed';
const DEFAULT_DATE = 'To be confirmed';
const MAX_RAW_JSON_BYTES = 60000;

const TOUR_ALIASES = {
  alfama: ['alfama', 'old town', 'graca', 'graça', 'viewpoints'],
  belem: ['belem', 'belém', 'jeronimos', 'jerónimos', 'discoveries', 'belem tower'],
  chiado: ['chiado', 'bairro alto', 'bica', 'baixa'],
  fullcity: ['full city', 'fullcity', 'complete lisbon', '4h', '4 hours'],
  van: ['van', 'sintra', 'cascais', 'obidos', 'óbidos', 'nazare', 'nazaré', 'fatima', 'fátima', 'evora', 'évora'],
};

function cleanString(value, maxLength = 300) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getPath(object, path) {
  return String(path || '').split('.').reduce((value, key) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[key];
  }, object);
}

function pickValue(object, paths) {
  for (const path of paths) {
    const value = getPath(object, path);
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function pickString(object, paths, maxLength = 300) {
  return cleanString(pickValue(object, paths), maxLength);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function firstObject(...values) {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  return {};
}

function compactObject(object) {
  const output = {};
  Object.entries(object).forEach(([key, value]) => {
    if (value !== undefined) output[key] = value;
  });
  return output;
}

function safeJson(value) {
  try {
    const text = JSON.stringify(value || {});
    if (Buffer.byteLength(text, 'utf8') <= MAX_RAW_JSON_BYTES) return value || {};
    return {
      truncated: true,
      reason: 'raw_json too large',
      bookingReference: pickString(value, ['booking.confirmationCode', 'confirmationCode', 'bookingId'], 120),
    };
  } catch {
    return { unserializable: true };
  }
}

function decodeBokunGraphqlId(value) {
  const raw = cleanString(value, 200);
  if (!raw) return '';

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    const match = decoded.match(/(?:Booking|booking):(\d+)/);
    if (match) return match[1];
  } catch {
    // Fall through to the raw value.
  }

  return raw;
}

function collectBookingLookupIds(payload = {}) {
  const candidates = [
    payload.bookingId,
    payload.id,
    payload.confirmationCode,
    payload.bookingConfirmationCode,
    payload.bookingReference,
    payload.reference,
    payload.data?.bookingId,
    payload.data?.id,
    payload.data?.confirmationCode,
    payload.data?.booking?.bookingId,
    payload.data?.booking?.confirmationCode,
    payload.booking?.bookingId,
    payload.booking?.id,
    payload.booking?.confirmationCode,
  ];

  return [...new Set(candidates.map(decodeBokunGraphqlId).filter(Boolean))];
}

async function fetchBookingDetails(payload = {}) {
  const lookupIds = collectBookingLookupIds(payload);
  let lastError = null;

  for (const lookupId of lookupIds) {
    const response = await getBookingByConfirmationCode(lookupId);
    if (response.ok && response.data) {
      return { booking: response.data, lookupId, fetched: true };
    }
    lastError = new Error(`Bókun booking lookup failed for ${lookupId} with status ${response.status}`);
    lastError.status = response.status;
  }

  if (lastError) throw lastError;
  return { booking: null, lookupId: '', fetched: false };
}

function getEventType(payload = {}, headers = {}) {
  return cleanString(
    pickValue({ payload, headers }, [
      'headers.x-bokun-topic',
      'headers.X-Bokun-Topic',
      'payload.topic',
      'payload.event',
      'payload.type',
      'payload.action',
      'payload.eventType',
    ]),
    120
  ) || 'booking.updated';
}

function getMainProductBooking(booking = {}) {
  const activityBookings = asArray(booking.activityBookings);
  const routeBookings = asArray(booking.routeBookings);
  const accommodationBookings = asArray(booking.accommodationBookings);
  const productBookings = asArray(booking.productBookings || booking.products || booking.items);

  return firstObject(
    activityBookings[0],
    routeBookings[0],
    accommodationBookings[0],
    productBookings[0],
    booking.productBooking
  );
}

function fullName(customer = {}, fallback = {}) {
  const first = cleanString(customer.firstName || fallback.firstName, 80);
  const last = cleanString(customer.lastName || fallback.lastName, 80);
  return cleanString(customer.fullName || customer.name || [first, last].filter(Boolean).join(' ') || fallback.name, 100);
}

function formatPhone(customer = {}, fallback = {}) {
  const number = cleanString(customer.phoneNumber || customer.phone || fallback.phoneNumber || fallback.phone, 60);
  if (!number) return '';
  if (number.startsWith('+')) return number;

  const countryCode = cleanString(customer.phoneNumberCountryCode || fallback.phoneNumberCountryCode, 12).replace(/[^\d+]/g, '');
  if (!countryCode) return number;
  return `${countryCode.startsWith('+') ? countryCode : `+${countryCode}`} ${number}`;
}

function getTourById(tourId) {
  return (tourData.tours || []).find((tour) => tour.id === tourId) || null;
}

function normalizeText(value) {
  return cleanString(value, 1000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function inferTourId(booking = {}, productBooking = {}) {
  const directId = pickString({ booking, productBooking }, [
    'booking.tourId',
    'booking.tour_slug',
    'productBooking.tourId',
    'productBooking.tour_slug',
  ], 60);
  if (getTourById(directId)) return directId;

  const idText = [
    productBooking.product?.id,
    productBooking.product?.externalId,
    productBooking.productExternalId,
    productBooking.activity?.id,
    productBooking.activity?.externalId,
    productBooking.experienceId,
  ].map((value) => cleanString(value, 80)).join(' ');

  const titleText = normalizeText([
    productBooking.product?.title,
    productBooking.product?.name,
    productBooking.activity?.title,
    productBooking.activity?.name,
    productBooking.title,
    productBooking.name,
    booking.title,
    booking.productName,
  ].filter(Boolean).join(' '));

  for (const tour of tourData.tours || []) {
    const shortName = normalizeText(tour.shortName || '');
    const search = normalizeText([
      tour.id,
      tour.name,
      tour.shortName,
      tour.homeName,
      `TUK-${tour.id.toUpperCase()}`,
    ].filter(Boolean).join(' '));
    if (titleText.includes(normalizeText(tour.id)) || (shortName && titleText.includes(shortName))) {
      return tour.id;
    }
    if (idText.toLowerCase().includes(`TUK-${tour.id.toUpperCase()}`.toLowerCase())) {
      return tour.id;
    }
    if (search && titleText.includes(search)) return tour.id;
  }

  for (const [tourId, aliases] of Object.entries(TOUR_ALIASES)) {
    if (aliases.some((alias) => titleText.includes(normalizeText(alias)))) return tourId;
  }

  return '';
}

function formatDate(dateValue) {
  const raw = cleanString(dateValue, 80);
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  return raw;
}

function formatTime(dateValue, explicitTime) {
  const explicit = cleanString(explicitTime, 40);
  if (explicit) return explicit;

  const raw = cleanString(dateValue, 80);
  const match = raw.match(/T(\d{2}:\d{2})| (\d{2}:\d{2})/);
  return match ? (match[1] || match[2]) : '';
}

function sumGuests(productBooking = {}) {
  const total = cleanNumber(productBooking.totalParticipants);
  if (total && total > 0) return Math.trunc(total);

  const quantities = productBooking.quantityByPricingCategory;
  if (quantities && typeof quantities === 'object') {
    const sum = Object.values(quantities).reduce((totalGuests, value) => totalGuests + (cleanNumber(value) || 0), 0);
    if (sum > 0) return Math.trunc(sum);
  }

  const categories = asArray(productBooking.pricingCategoryBookings);
  const categorySum = categories.reduce((totalGuests, item) => {
    return totalGuests + (cleanNumber(item.quantity) || cleanNumber(item.count) || 1);
  }, 0);
  if (categorySum > 0) return Math.trunc(categorySum);

  return 1;
}

function getPickup(productBooking = {}, booking = {}) {
  const pickup = cleanString(
    productBooking.pickupPlaceDescription ||
    productBooking.pickupPlace?.title ||
    productBooking.pickupPlace?.address ||
    booking.pickup ||
    booking.pickupArea,
    180
  );
  return pickup || DEFAULT_PICKUP;
}

function getPaymentStatus(booking = {}, productBooking = {}) {
  return cleanString(
    booking.paymentStatus ||
    booking.paymentType ||
    booking.paidType ||
    productBooking.paidType ||
    productBooking.paymentStatus,
    60
  );
}

function getStatusFromEvent(eventType, bookingStatus) {
  const normalized = normalizeText(`${eventType} ${bookingStatus}`);
  if (normalized.includes('cancel')) return 'reserva_bokun_cancelada';
  if (normalized.includes('confirm')) return 'reserva_bokun_confirmada';
  if (normalized.includes('paid') || normalized.includes('payment')) return 'reserva_bokun_pagamento';
  return 'reserva_bokun_recebida';
}

function normalizeBokunBooking({ payload = {}, booking = null, headers = {} } = {}) {
  const sourceBooking = booking || payload.booking || payload.data?.booking || payload.data || payload;
  const productBooking = getMainProductBooking(sourceBooking);
  const customer = firstObject(sourceBooking.customer, productBooking.customer, payload.customer, payload.data?.customer);
  const eventType = getEventType(payload, headers);
  const tourId = inferTourId(sourceBooking, productBooking);
  const tour = getTourById(tourId);
  const dateValue = productBooking.date || productBooking.startDate || sourceBooking.startDate || sourceBooking.date;
  const totalPrice = cleanNumber(sourceBooking.totalPrice) ?? cleanNumber(productBooking.totalPrice) ?? tour?.price?.amount ?? null;
  const totalPaid = cleanNumber(sourceBooking.totalPaid) ?? cleanNumber(productBooking.paidAmount) ?? null;
  const totalDue = cleanNumber(sourceBooking.totalDue) ?? (totalPrice != null && totalPaid != null ? Math.max(totalPrice - totalPaid, 0) : null);
  const status = getStatusFromEvent(eventType, sourceBooking.status || productBooking.status);
  const bookingReference = cleanString(
    sourceBooking.confirmationCode ||
    sourceBooking.bookingReference ||
    sourceBooking.reference ||
    sourceBooking.bookingId ||
    payload.confirmationCode ||
    payload.bookingId ||
    payload.id,
    120
  );
  const productConfirmationCode = cleanString(productBooking.productConfirmationCode || productBooking.confirmationCode, 120);
  const normalized = {
    eventType,
    status,
    bookingId: cleanString(sourceBooking.bookingId || sourceBooking.id || payload.bookingId || payload.id, 80),
    bookingReference,
    productConfirmationCode,
    name: fullName(customer, payload),
    email: cleanString(customer.email || payload.email, 160),
    phone: formatPhone(customer, payload),
    tourId,
    tourName: tour?.name || cleanString(
      productBooking.product?.title ||
      productBooking.product?.name ||
      productBooking.activity?.title ||
      productBooking.activity?.name ||
      productBooking.title ||
      sourceBooking.productName,
      160
    ),
    desiredDate: formatDate(dateValue) || DEFAULT_DATE,
    preferredTime: formatTime(dateValue, productBooking.startTime) || DEFAULT_TIME,
    startDateTime: cleanString(dateValue, 80),
    guests: Math.min(Math.max(sumGuests(productBooking), 1), 60),
    pickupArea: getPickup(productBooking, sourceBooking),
    currency: cleanString(sourceBooking.currency || productBooking.currency || tour?.price?.currency || 'EUR', 12),
    totalPrice,
    depositPaid: totalPaid,
    remainingDue: totalDue,
    paymentStatus: getPaymentStatus(sourceBooking, productBooking),
    createdAt: cleanString(sourceBooking.creationDate || productBooking.creationDate || payload.createdAt, 80) || new Date().toISOString(),
    sourcePath: tour?.url ? `/booking.html?tour=${tour.id}` : '/booking.html',
    rawJson: safeJson({ webhook: payload, booking: sourceBooking }),
  };

  normalized.message = buildBookingMessage(normalized);
  normalized.errors = validateNormalizedBooking(normalized);
  return normalized;
}

function buildBookingMessage(booking) {
  return [
    booking.bookingReference ? `Bókun booking: ${booking.bookingReference}` : '',
    booking.productConfirmationCode ? `Product booking: ${booking.productConfirmationCode}` : '',
    booking.status ? `Status: ${booking.status}` : '',
    booking.paymentStatus ? `Payment status: ${booking.paymentStatus}` : '',
    booking.totalPrice != null ? `Total: ${booking.currency} ${booking.totalPrice}` : '',
    booking.depositPaid != null ? `Paid/deposit: ${booking.currency} ${booking.depositPaid}` : '',
    booking.remainingDue != null ? `Remaining: ${booking.currency} ${booking.remainingDue}` : '',
    booking.eventType ? `Webhook event: ${booking.eventType}` : '',
  ].filter(Boolean).join('\n').slice(0, 1000);
}

function validateNormalizedBooking(booking) {
  const errors = [];
  if (!booking.bookingReference && !booking.bookingId) errors.push('bookingReference');
  if (!booking.name) errors.push('name');
  if (!booking.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) errors.push('email');
  if (!booking.phone) errors.push('phone');
  if (!booking.tourId || !getTourById(booking.tourId)) errors.push('tourId');
  if (!booking.desiredDate) errors.push('desiredDate');
  if (!booking.preferredTime) errors.push('preferredTime');
  if (!booking.guests) errors.push('guests');
  return errors;
}

function buildEdgeLeadPayload(booking) {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'bokun_checkout',
    name: booking.name,
    email: booking.email,
    phone: booking.phone,
    phoneConsent: Boolean(booking.phone),
    contactPreference: 'sms_whatsapp',
    desiredDate: booking.desiredDate,
    preferredTime: booking.preferredTime,
    guests: booking.guests,
    pickupArea: booking.pickupArea,
    tourId: booking.tourId,
    message: booking.message,
    sourcePath: booking.sourcePath,
    qualification: 'HOT',
    bokun: {
      bookingId: booking.bookingId,
      bookingReference: booking.bookingReference,
      productConfirmationCode: booking.productConfirmationCode,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      totalPrice: booking.totalPrice,
      depositPaid: booking.depositPaid,
      remainingDue: booking.remainingDue,
      currency: booking.currency,
      eventType: booking.eventType,
    },
  };
}

function supabaseConfig() {
  return {
    url: cleanString(process.env.SUPABASE_URL, 300).replace(/\/$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

function hasDirectSupabaseConfig() {
  const config = supabaseConfig();
  return Boolean(config.url && config.key);
}

async function supabaseRest(path, options = {}) {
  const config = supabaseConfig();
  if (!config.url || !config.key) return null;
  const response = await fetch(`${config.url}${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`Supabase request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function tablePath(table, params = {}) {
  const search = new URLSearchParams(params);
  const query = search.toString();
  return `/rest/v1/${encodeURIComponent(table)}${query ? `?${query}` : ''}`;
}

async function upsertCliente(booking) {
  const rows = await supabaseRest(tablePath('Clientes - Tuk Tuk', { on_conflict: 'telefone' }), {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      nome: booking.name,
      telefone: booking.phone,
      email: booking.email,
      agente: 'bokun_checkout',
      user_profile: 'online_booking',
      status: 'ativo',
      role: 'cliente',
    },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function buildReservaRow(booking) {
  const ticketId = booking.bookingReference || booking.bookingId || booking.productConfirmationCode;
  return compactObject({
    ticket_id: ticketId,
    telefone: booking.phone,
    nome: booking.name,
    email: booking.email,
    tour: booking.tourName,
    data_tour: booking.desiredDate,
    hora_tour: booking.preferredTime,
    data_hora_tour: booking.startDateTime || undefined,
    pessoas: booking.guests,
    preco_total: booking.totalPrice,
    deposito: booking.depositPaid,
    restante: booking.remainingDue,
    idioma: 'en',
  });
}

async function upsertReserva(booking) {
  const rows = await supabaseRest(tablePath('Reservas', { on_conflict: 'ticket_id' }), {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: buildReservaRow(booking),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

function buildDirectLeadRow(booking, cliente, reserva) {
  const now = new Date().toISOString();
  return {
    updated_at: now,
    origem: 'bokun_checkout',
    canal: 'bokun',
    agente: 'bokun_webhook',
    cliente_id: cliente?.id || null,
    reserva_id: reserva?.id || null,
    nome: booking.name,
    email: booking.email,
    telefone: booking.phone,
    tour: booking.tourName,
    tour_slug: booking.tourId,
    data_tour: booking.desiredDate,
    hora_tour: booking.preferredTime,
    pessoas: booking.guests,
    pickup: booking.pickupArea,
    mensagem: booking.message,
    source_path: booking.sourcePath,
    qualificacao: 'HOT',
    status: booking.status,
    followup_status: 'pendente',
    raw_json: booking.rawJson,
  };
}

async function upsertLead(booking, cliente, reserva) {
  const params = {
    select: 'id',
    reserva_id: `eq.${reserva.id}`,
    origem: 'eq.bokun_checkout',
    limit: '1',
  };
  const existing = await supabaseRest(tablePath('Leads - Tuk Tuk', params));
  const row = buildDirectLeadRow(booking, cliente, reserva);

  if (Array.isArray(existing) && existing[0]?.id) {
    await supabaseRest(tablePath('Leads - Tuk Tuk', { id: `eq.${existing[0].id}` }), {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: row,
    });
    return { id: existing[0].id, action: 'updated' };
  }

  const inserted = await supabaseRest(tablePath('Leads - Tuk Tuk'), {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      ...row,
      created_at: new Date().toISOString(),
    },
  });
  return { id: Array.isArray(inserted) ? inserted[0]?.id : inserted?.id, action: 'inserted' };
}

async function upsertBookingInSupabase(booking) {
  if (!hasDirectSupabaseConfig()) return null;
  if (booking.errors.length) return null;
  const cliente = await upsertCliente(booking);
  const reserva = await upsertReserva(booking);
  const lead = await upsertLead(booking, cliente, reserva);
  return {
    delivery: 'supabase',
    clienteId: cliente?.id || null,
    reservaId: reserva?.id || null,
    leadId: lead.id || null,
    leadAction: lead.action,
  };
}

async function deliverToSupabaseEdgeLead(booking, context = {}) {
  if (booking.errors.length) return null;
  const payload = buildEdgeLeadPayload(booking);
  const response = await postSupabaseEdgeFunction(payload, context);
  return response ? { ...response, leadMode: 'bokun_checkout_edge_lead' } : null;
}

function hmacSha256Hex(secret, text) {
  return crypto.createHmac('sha256', secret).update(text).digest('hex');
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function canonicalBokunHeaders(headers = {}) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value)])
    .filter(([key]) => key.startsWith('x-bokun-') && key !== 'x-bokun-hmac')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function verifyBokunHmac(headers = {}, secret = '') {
  const headerHmac = cleanString(headers['x-bokun-hmac'] || headers['X-Bokun-Hmac'], 200);
  if (!headerHmac || !secret) return false;
  const canonical = canonicalBokunHeaders(headers);
  const expectedHex = hmacSha256Hex(secret, canonical);
  const expectedBase64 = Buffer.from(expectedHex, 'hex').toString('base64');
  return timingSafeEqualText(headerHmac, expectedHex) || timingSafeEqualText(headerHmac, expectedBase64);
}

function getQueryToken(req) {
  const query = req.query || {};
  const token = Array.isArray(query.token) ? query.token[0] : query.token;
  return cleanString(token || req.headers['x-tuktuk-webhook-token'], 200);
}

function isAuthorizedWebhook(req) {
  const headers = req.headers || {};
  const tokenSecret = process.env.BOKUN_BOOKING_WEBHOOK_TOKEN || '';
  const token = getQueryToken(req);
  if (tokenSecret && timingSafeEqualText(token, tokenSecret)) return true;

  const hmacSecret = process.env.BOKUN_BOOKING_WEBHOOK_SECRET ||
    process.env.BOKUN_WEBHOOK_SECRET ||
    process.env.BOKUN_SECRET_KEY ||
    '';

  return verifyBokunHmac(headers, hmacSecret);
}

async function forwardBookingEvent(booking, payload) {
  const url = cleanString(process.env.BOKUN_BOOKING_FORWARD_URL || process.env.BOKUN_BOOKING_WEBHOOK_FORWARD_URL, 500);
  if (!url) return null;

  const body = JSON.stringify({ booking, raw: payload });
  const headers = { 'Content-Type': 'application/json' };
  const secret = process.env.BOKUN_BOOKING_FORWARD_SECRET;
  if (secret) headers['X-TukTuk-Signature'] = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) {
    throw new Error(`Bókun booking forward failed with status ${response.status}`);
  }
  return { delivery: 'forward' };
}

async function processBokunBookingWebhook(payload = {}, context = {}) {
  const suppliedBooking = payload.booking || payload.data?.booking || null;
  const fetched = suppliedBooking ? { booking: suppliedBooking, lookupId: '', fetched: false } : await fetchBookingDetails(payload);
  const booking = normalizeBokunBooking({
    payload,
    booking: fetched.booking,
    headers: context.headers || {},
  });

  const deliveries = [];
  const directSupabase = await upsertBookingInSupabase(booking);
  if (directSupabase) deliveries.push(directSupabase);

  if (!directSupabase) {
    const edgeLead = await deliverToSupabaseEdgeLead(booking, context);
    if (edgeLead) deliveries.push(edgeLead);
  }

  const forward = await forwardBookingEvent(booking, payload);
  if (forward) deliveries.push(forward);

  return {
    ok: deliveries.length > 0,
    delivery: deliveries.length ? deliveries.map((item) => item.delivery).join('+') : 'not_configured',
    deliveries,
    fetchedFromBokun: fetched.fetched,
    lookupId: fetched.lookupId,
    booking,
  };
}

module.exports = {
  buildEdgeLeadPayload,
  canonicalBokunHeaders,
  collectBookingLookupIds,
  decodeBokunGraphqlId,
  fetchBookingDetails,
  inferTourId,
  isAuthorizedWebhook,
  normalizeBokunBooking,
  processBokunBookingWebhook,
  upsertBookingInSupabase,
  verifyBokunHmac,
};
