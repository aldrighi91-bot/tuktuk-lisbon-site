const crypto = require('crypto');
const tourData = require('../../data/tours.json');

const MAX_FIELD_LENGTHS = {
  name: 100,
  email: 160,
  phone: 60,
  desiredDate: 80,
  preferredTime: 40,
  pickupArea: 180,
  tourId: 40,
  message: 1000,
  sourcePath: 300,
};

function cleanString(value, maxLength) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeLead(input = {}) {
  const lead = {};
  for (const [key, maxLength] of Object.entries(MAX_FIELD_LENGTHS)) {
    lead[key] = cleanString(input[key], maxLength);
  }
  const guests = Number(input.guests);
  lead.guests = Number.isInteger(guests) && guests > 0 && guests <= 60 ? guests : null;
  lead.qualification = ['HOT', 'WARM', 'INFORMATIONAL'].includes(input.qualification)
    ? input.qualification
    : 'WARM';
  return lead;
}

function validateLead(lead) {
  const errors = [];
  if (!lead.name) errors.push('name');
  if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errors.push('email');
  if (!lead.desiredDate) errors.push('desiredDate');
  if (!lead.preferredTime) errors.push('preferredTime');
  if (!lead.guests) errors.push('guests');
  if (!lead.pickupArea) errors.push('pickupArea');
  if (!lead.tourId) errors.push('tourId');
  return errors;
}

function buildLeadPayload(input = {}) {
  const lead = sanitizeLead(input);
  return {
    ...lead,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: 'site_concierge',
  };
}

function getTourName(tourId) {
  const tour = tourData.tours.find((item) => item.id === tourId);
  return tour ? tour.name : tourId;
}

function buildSupabaseLeadRow(payload) {
  return {
    id: payload.id,
    created_at: payload.createdAt,
    updated_at: payload.createdAt,
    origem: payload.source,
    canal: 'site',
    agente: 'concierge_site',
    nome: payload.name,
    email: payload.email,
    telefone: payload.phone || null,
    tour: getTourName(payload.tourId),
    tour_slug: payload.tourId,
    data_tour: payload.desiredDate,
    hora_tour: payload.preferredTime,
    pessoas: payload.guests,
    pickup: payload.pickupArea,
    mensagem: payload.message || null,
    source_path: payload.sourcePath || null,
    qualificacao: payload.qualification,
    status: 'novo',
    followup_status: 'pendente',
    raw_json: payload,
  };
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function postWebhook(payload) {
  const url = process.env.CONCIERGE_LEAD_WEBHOOK_URL;
  if (!url) return null;

  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CONCIERGE_LEAD_WEBHOOK_SECRET) {
    headers['X-TukTuk-Signature'] = signPayload(body, process.env.CONCIERGE_LEAD_WEBHOOK_SECRET);
  }

  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) {
    throw new Error(`lead webhook failed with status ${response.status}`);
  }
  return { delivery: 'webhook' };
}

async function insertSupabase(payload) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const table = process.env.SUPABASE_LEADS_TABLE || 'Leads - Tuk Tuk';
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}`;
  const row = buildSupabaseLeadRow(payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    throw new Error(`supabase insert failed with status ${response.status}`);
  }
  return { delivery: 'supabase', table };
}

async function deliverLead(payload) {
  const deliveries = [];
  const supabase = await insertSupabase(payload);
  if (supabase) deliveries.push(supabase);

  const webhook = await postWebhook(payload);
  if (webhook) deliveries.push(webhook);

  if (!deliveries.length) {
    return { delivery: 'not_configured' };
  }
  return { delivery: deliveries.map((item) => item.delivery).join('+'), deliveries };
}

module.exports = {
  buildLeadPayload,
  buildSupabaseLeadRow,
  deliverLead,
  sanitizeLead,
  validateLead,
};
