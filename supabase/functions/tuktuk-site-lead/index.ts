const TOUR_NAMES: Record<string, string> = {
  alfama: 'Alfama Tour',
  belem: 'Belem Tour',
  chiado: 'Chiado & Bairro Alto Tour',
  fullcity: 'Full City Tour',
  van: 'Van Full Day Tour',
};

const MAX_FIELD_LENGTHS: Record<string, number> = {
  name: 100,
  email: 160,
  phone: 60,
  phoneConsentText: 300,
  contactPreference: 40,
  desiredDate: 80,
  preferredTime: 40,
  pickupArea: 180,
  tourId: 40,
  message: 1000,
  sourcePath: 300,
};

const ALLOWED_ORIGINS = new Set([
  'https://tuktuklisbon.tours',
  'https://www.tuktuklisbon.tours',
]);

function responseJson(status: number, data: Record<string, unknown>, origin?: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': origin || 'https://www.tuktuklisbon.tours',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    },
  });
}

function isAllowedOrigin(origin: string) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https:\/\/tuktuk-lisbon-site-[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+-aldrighi91-9702s-projects\.vercel\.app$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin)) return true;
  return false;
}

function cleanString(value: unknown, maxLength: number) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeLead(input: Record<string, unknown> = {}) {
  const lead: Record<string, unknown> = {};
  for (const [key, maxLength] of Object.entries(MAX_FIELD_LENGTHS)) {
    lead[key] = cleanString(input[key], maxLength);
  }

  const guests = Number(input.guests);
  lead.guests = Number.isInteger(guests) && guests > 0 && guests <= 60 ? guests : null;
  lead.qualification = ['HOT', 'WARM', 'INFORMATIONAL'].includes(String(input.qualification))
    ? input.qualification
    : 'WARM';
  lead.id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(input.id))
    ? input.id
    : crypto.randomUUID();
  lead.createdAt = cleanString(input.createdAt, 40) || new Date().toISOString();
  lead.source = cleanString(input.source, 40) || 'site_concierge';
  lead.phoneConsent = Boolean(input.phoneConsent && lead.phone);
  lead.phoneSkipped = input.phoneSkipped === true || input.phoneSkipped === 'true';
  if (!lead.contactPreference) lead.contactPreference = lead.phone ? 'sms_whatsapp' : 'email';
  if (input.bokun && typeof input.bokun === 'object' && !Array.isArray(input.bokun)) {
    lead.bokun = input.bokun;
  }
  return lead;
}

function validateLead(lead: Record<string, unknown>) {
  const errors: string[] = [];
  if (!lead.name) errors.push('name');
  if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(lead.email))) errors.push('email');
  if (!lead.desiredDate) errors.push('desiredDate');
  if (!lead.preferredTime) errors.push('preferredTime');
  if (!lead.guests) errors.push('guests');
  if (!lead.pickupArea) errors.push('pickupArea');
  if (!lead.tourId || !TOUR_NAMES[String(lead.tourId)]) errors.push('tourId');
  if (!lead.phone) errors.push('phone');
  return errors;
}

function getAdminKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed?.default) return String(parsed.default);
    } catch {
      // Fall through to the legacy key.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function adminHeaders() {
  const key = getAdminKey();
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
  };
  if (key.includes('.') || key.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function getClientBucket(req: Request) {
  const forwardedFor = req.headers.get('x-tuktuk-forwarded-for') || req.headers.get('x-forwarded-for') || '';
  const ip = forwardedFor.split(',')[0]?.trim() || 'unknown-ip';
  const userAgent = req.headers.get('x-tuktuk-user-agent') || req.headers.get('user-agent') || 'unknown-agent';
  return `${ip}:${userAgent}`.slice(0, 128);
}

async function checkRateLimit(supabaseUrl: string, headers: Record<string, string>, bucketKey: string) {
  const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/tuktuk_check_site_lead_rate_limit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_bucket_key: bucketKey,
      p_window_start: windowStart,
      p_max_requests: 8,
    }),
  });

  if (!response.ok) {
    throw new Error(`rate limit check failed with status ${response.status}`);
  }
  return Boolean(await response.json());
}

function buildRow(lead: Record<string, unknown>) {
  return {
    id: lead.id,
    cliente_id: null,
    reserva_id: null,
    created_at: lead.createdAt,
    updated_at: lead.createdAt,
    origem: lead.source,
    canal: 'site',
    agente: 'concierge_site',
    nome: lead.name,
    email: lead.email,
    telefone: lead.phone || null,
    tour: TOUR_NAMES[String(lead.tourId)],
    tour_slug: lead.tourId,
    data_tour: lead.desiredDate,
    hora_tour: lead.preferredTime,
    pessoas: lead.guests,
    pickup: lead.pickupArea,
    mensagem: lead.message || null,
    source_path: lead.sourcePath || null,
    qualificacao: lead.qualification,
    status: 'novo',
    followup_status: 'pendente',
    raw_json: lead,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const corsOrigin = origin && isAllowedOrigin(origin) ? origin : undefined;

  if (req.method === 'OPTIONS') {
    return responseJson(204, {}, corsOrigin);
  }

  if (origin && !isAllowedOrigin(origin)) {
    return responseJson(403, { error: 'Origin not allowed' }, corsOrigin);
  }

  if (req.method !== 'POST') {
    return responseJson(405, { error: 'Method Not Allowed' }, corsOrigin);
  }

  const contentLength = Number(req.headers.get('content-length') || '0');
  if (contentLength > 12000) {
    return responseJson(413, { error: 'Payload too large' }, corsOrigin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const key = getAdminKey();
  if (!supabaseUrl || !key) {
    return responseJson(500, { error: 'Supabase function is not configured' }, corsOrigin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return responseJson(400, { error: 'Invalid JSON' }, corsOrigin);
  }

  const input = typeof body.payload === 'object' && body.payload !== null
    ? body.payload as Record<string, unknown>
    : body;
  const lead = sanitizeLead(input);
  const errors = validateLead(lead);
  if (errors.length) {
    return responseJson(400, { error: 'Missing required fields', fields: errors }, corsOrigin);
  }

  const headers = adminHeaders();
  const allowed = await checkRateLimit(supabaseUrl, headers, getClientBucket(req));
  if (!allowed) {
    return responseJson(429, { error: 'Too many lead requests' }, corsOrigin);
  }

  const table = 'Leads - Tuk Tuk';
  const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(buildRow(lead)),
  });

  if (!response.ok) {
    return responseJson(502, { error: 'Lead delivery failed' }, corsOrigin);
  }

  return responseJson(200, { ok: true, leadId: lead.id, delivery: 'supabase_edge' }, corsOrigin);
});
