const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  capacityNote,
  chooseRecommendedTour,
  classifyIntent,
  handleConciergeMessage,
  missingLeadFields,
} = require('../lib/concierge/assistant');

const {
  buildLeadPayload,
  buildSupabaseLeadRow,
  deliverLead,
  sanitizeLead,
  validateLead,
} = require('../lib/concierge/lead-store');

const {
  buildCustomerConfirmation,
  sendLeadNotificationEmails,
} = require('../lib/concierge/lead-notifications');

test('teaser prompt can be dismissed without opening the chat panel', () => {
  const widget = fs.readFileSync(path.join(__dirname, '..', 'concierge.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'assets', 'concierge.css'), 'utf8');

  assert.match(widget, /data-teaser-close/);
  assert.match(widget, /function hideTeaser/);
  assert.match(widget, /sessionStorage\.setItem\('tlc_teaser_closed', '1'\)/);
  assert.match(styles, /\.tlc-teaser-close/);
});

test('submitted leads show booking and home follow-up actions', () => {
  const widget = fs.readFileSync(path.join(__dirname, '..', 'concierge.js'), 'utf8');

  assert.match(widget, /Book Online', action: 'book_online'/);
  assert.match(widget, /Back to home', action: 'link', href: '\/'/);
  assert.match(widget, /WhatsApp as backup', action: 'whatsapp'/);
});

test('recommends Belem for Portuguese Discoveries interest', () => {
  const tour = chooseRecommendedTour({ message: 'We want monuments, Belem and the Portuguese Discoveries' });
  assert.equal(tour.id, 'belem');
});

test('recommends Alfama for a short historic Lisbon visit', () => {
  const tour = chooseRecommendedTour({ message: 'We have 90 minutes and want historic old Lisbon with viewpoints' });
  assert.equal(tour.id, 'alfama');
});

test('classifies booking and availability requests as HOT', () => {
  assert.equal(classifyIntent('Can I book tomorrow at 10?'), 'HOT');
  assert.equal(classifyIntent('Do you have availability this week?'), 'HOT');
});

test('capacity note separates vehicle capacity from availability', () => {
  const note = capacityNote(7);
  assert.match(note, /Each tuk tuk seats up to 6/);
  assert.match(note, /confirm/i);
  assert.doesNotMatch(note, /\bavailable\b/i);
});

test('availability flow does not invent availability', () => {
  const response = handleConciergeMessage({
    message: 'Can we book tomorrow at 10 for 4 people?',
    state: { lead: { tourId: 'alfama' } },
  });
  assert.equal(response.qualification, 'HOT');
  assert.match(response.reply, /Let me check availability/i);
  assert.doesNotMatch(response.reply, /\bis available\b/i);
});

test('payment answers use the current deposit policy', () => {
  const response = handleConciergeMessage({
    message: 'Can I pay by card or cash?',
    state: { lead: { tourId: 'alfama' } },
  });

  assert.match(response.reply, /20% deposit/i);
  assert.match(response.reply, /card or cash/i);
  assert.doesNotMatch(response.reply, /no deposit/i);
});

test('lead validation requires phone with the other booking details', () => {
  const lead = sanitizeLead({
    name: 'Alex',
    email: 'alex@example.com',
    phone: '+1 415 555 0199',
    desiredDate: 'tomorrow',
    preferredTime: '10 am',
    guests: 2,
    pickupArea: 'Hotel Mundial',
    tourId: 'alfama',
  });
  assert.deepEqual(validateLead(lead), []);
  assert.equal(lead.phone, '+1 415 555 0199');
});

test('missing lead fields are progressive', () => {
  assert.deepEqual(
    missingLeadFields({ tourId: 'belem', desiredDate: 'Friday', guests: 3 }),
    ['preferred time', 'pickup area', 'name', 'email', 'phone']
  );
});

test('availability flow expects preferred time before name', () => {
  const response = handleConciergeMessage({
    message: 'We want to book Alfama tomorrow for 2 people. My email is alex@example.com',
    state: { lead: {} },
  });
  assert.equal(response.nextExpectedField, 'preferredTime');
  assert.match(response.reply, /preferred time/i);
});

test('lead capture asks pickup before name', () => {
  const response = handleConciergeMessage({
    message: '10 am',
    state: {
      expectedField: 'preferredTime',
      qualification: 'HOT',
      lead: {
        tourId: 'alfama',
        desiredDate: 'tomorrow',
        guests: 2,
        email: 'alex@example.com',
      },
    },
  });
  assert.equal(response.nextExpectedField, 'pickupArea');
  assert.match(response.reply, /pickup/i);
});

test('lead capture continues after pickup and name answers', () => {
  const timeResponse = handleConciergeMessage({
    message: 'Hotel Mundial',
    state: {
      expectedField: 'pickupArea',
      qualification: 'HOT',
      lead: {
        tourId: 'alfama',
        desiredDate: 'tomorrow',
        preferredTime: '10 am',
        guests: 2,
        email: 'alex@example.com',
      },
    },
  });
  assert.equal(timeResponse.nextExpectedField, 'name');
  assert.equal(timeResponse.leadPatch.pickupArea, 'Hotel Mundial');
  assert.match(timeResponse.reply, /name/i);

  const nameResponse = handleConciergeMessage({
    message: 'Alex Johnson',
    state: {
      expectedField: 'name',
      qualification: 'HOT',
      lead: {
        tourId: 'alfama',
        desiredDate: 'tomorrow',
        preferredTime: '10 am',
        guests: 2,
        pickupArea: 'Hotel Mundial',
        email: 'alex@example.com',
      },
    },
  });
  assert.equal(nameResponse.nextExpectedField, 'phone');
  assert.match(nameResponse.reply, /mobile number|SMS|WhatsApp/i);

  const skipPhoneResponse = handleConciergeMessage({
    message: 'Email only',
    state: {
      expectedField: 'phone',
      qualification: 'HOT',
      lead: {
        tourId: 'alfama',
        desiredDate: 'tomorrow',
        preferredTime: '10 am',
        guests: 2,
        pickupArea: 'Hotel Mundial',
        name: 'Alex Johnson',
        email: 'alex@example.com',
      },
    },
  });
  assert.equal(skipPhoneResponse.nextExpectedField, 'phone');
  assert.equal(skipPhoneResponse.leadPatch.phone, undefined);
  assert.equal(skipPhoneResponse.leadReady, undefined);
  assert.deepEqual(skipPhoneResponse.quickReplies, []);
  assert.match(skipPhoneResponse.reply, /mobile number|SMS|WhatsApp/i);
});

test('phone capture stores consent and makes lead ready', () => {
  const response = handleConciergeMessage({
    message: '+1 415 555 0199',
    state: {
      expectedField: 'phone',
      qualification: 'HOT',
      lead: {
        tourId: 'alfama',
        desiredDate: 'tomorrow',
        preferredTime: '10 am',
        guests: 2,
        pickupArea: 'Hotel Mundial',
        name: 'Alex Johnson',
        email: 'alex@example.com',
      },
    },
  });
  assert.equal(response.leadPatch.phone, '+1 415 555 0199');
  assert.equal(response.leadPatch.phoneConsent, true);
  assert.equal(response.leadPatch.contactPreference, 'sms_whatsapp');
  assert.equal(response.leadReady, true);
  assert.equal(response.ctas[0].action, 'submit_lead');
});

test('range group quick reply captures the larger guest count', () => {
  const response = handleConciergeMessage({
    message: '7-8 people',
    state: {
      expectedField: 'guests',
      qualification: 'HOT',
      lead: {
        tourId: 'fullcity',
        desiredDate: 'tomorrow',
        preferredTime: 'afternoon',
      },
    },
  });
  assert.equal(response.leadPatch.guests, 8);
  assert.equal(response.leadPatch.desiredDate, 'tomorrow');
  assert.equal(response.leadPatch.preferredTime, 'afternoon');
  assert.equal(response.nextExpectedField, 'pickupArea');
});

test('Supabase lead row uses the Tuk Tuk database pattern', () => {
  const payload = buildLeadPayload({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1 415 555 0199',
    phoneConsent: true,
    desiredDate: 'tomorrow',
    preferredTime: '10 am',
    guests: 2,
    pickupArea: 'Hotel Mundial',
    tourId: 'alfama',
    qualification: 'HOT',
    sourcePath: '/tours/alfama',
  });
  const row = buildSupabaseLeadRow(payload);
  assert.equal(row.cliente_id, null);
  assert.equal(row.reserva_id, null);
  assert.equal(row.origem, 'site_concierge');
  assert.equal(row.canal, 'site');
  assert.equal(row.agente, 'concierge_site');
  assert.equal(row.nome, 'Alex Johnson');
  assert.equal(row.telefone, '+1 415 555 0199');
  assert.equal(row.tour, 'Alfama Tour');
  assert.equal(row.tour_slug, 'alfama');
  assert.equal(row.data_tour, 'tomorrow');
  assert.equal(row.hora_tour, '10 am');
  assert.equal(row.pessoas, 2);
  assert.equal(row.pickup, 'Hotel Mundial');
  assert.equal(row.qualificacao, 'HOT');
  assert.equal(row.status, 'novo');
  assert.equal(row.followup_status, 'pendente');
  assert.equal(row.raw_json.phoneConsent, true);
  assert.equal(row.raw_json.contactPreference, 'sms_whatsapp');
});

test('customer lead confirmation is a receipt, not a booking confirmation', () => {
  const payload = buildLeadPayload({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1 415 555 0199',
    desiredDate: 'Friday',
    preferredTime: '10 am',
    guests: 2,
    pickupArea: 'Hotel Mundial',
    tourId: 'alfama',
    qualification: 'HOT',
  });
  const email = buildCustomerConfirmation(payload, 'contact@tuktuklisbon.tours');

  assert.equal(email.subject, 'We received your TukTuk Lisbon request');
  assert.match(email.text, /Thank you for contacting TukTuk Lisbon/);
  assert.match(email.text, /This is not a booking confirmation yet/);
  assert.match(email.text, /checking availability, pricing/);
  assert.doesNotMatch(email.text, /booking confirmed/i);
});

test('lead notification emails are sent to owner and customer through Resend', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CONCIERGE_EMAIL_FROM: process.env.CONCIERGE_EMAIL_FROM,
    CONCIERGE_NOTIFICATION_TO: process.env.CONCIERGE_NOTIFICATION_TO,
    CONCIERGE_REPLY_TO: process.env.CONCIERGE_REPLY_TO,
    CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED: process.env.CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED,
  };
  const requests = [];
  process.env.RESEND_API_KEY = 're_test';
  process.env.CONCIERGE_EMAIL_FROM = 'TukTuk Lisbon <contact@tuktuklisbon.tours>';
  process.env.CONCIERGE_NOTIFICATION_TO = 'contact@tuktuklisbon.tours';
  process.env.CONCIERGE_REPLY_TO = 'contact@tuktuklisbon.tours';
  delete process.env.CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED;

  const payload = buildLeadPayload({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1 415 555 0199',
    desiredDate: 'Friday',
    preferredTime: '10 am',
    guests: 2,
    pickupArea: 'Hotel Mundial',
    tourId: 'alfama',
    message: 'Is there availability?',
    qualification: 'HOT',
  });

  try {
    global.fetch = async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ id: `email-${requests.length}` }), { status: 200 });
    };

    const result = await sendLeadNotificationEmails(payload);
    assert.equal(result.delivery, 'email');
    assert.equal(result.provider, 'resend');
    assert.equal(requests.length, 2);

    assert.equal(requests[0].url, 'https://api.resend.com/emails');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer re_test');
    assert.equal(requests[0].options.headers['User-Agent'], 'tuktuk-lisbon-site/1.0');
    assert.equal(requests[0].options.headers['Idempotency-Key'], `tuktuk-lead-${payload.id}-owner`);
    assert.equal(requests[0].body.to, 'contact@tuktuklisbon.tours');
    assert.equal(requests[0].body.reply_to, 'alex@example.com');
    assert.match(requests[0].body.text, /New lead received/);
    assert.match(requests[0].body.text, /Is there availability/);

    assert.equal(requests[1].options.headers['Idempotency-Key'], `tuktuk-lead-${payload.id}-customer`);
    assert.equal(requests[1].body.to, 'alex@example.com');
    assert.equal(requests[1].body.reply_to, 'contact@tuktuklisbon.tours');
    assert.match(requests[1].body.text, /This is not a booking confirmation yet/);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('lead delivery falls back to the Supabase Edge Function without Vercel secrets', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_EDGE_LEAD_URL: process.env.SUPABASE_EDGE_LEAD_URL,
    CONCIERGE_LEAD_WEBHOOK_URL: process.env.CONCIERGE_LEAD_WEBHOOK_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED: process.env.CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED,
  };

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.CONCIERGE_LEAD_WEBHOOK_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED;
  process.env.SUPABASE_EDGE_LEAD_URL = 'https://example.test/functions/v1/tuktuk-site-lead';

  const payload = buildLeadPayload({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1 415 555 0199',
    desiredDate: 'tomorrow',
    preferredTime: '10 am',
    guests: 2,
    pickupArea: 'Hotel Mundial',
    tourId: 'alfama',
    qualification: 'HOT',
  });

  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://example.test/functions/v1/tuktuk-site-lead');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-TukTuk-Forwarded-For'], '203.0.113.10');
      assert.equal(options.headers['X-TukTuk-User-Agent'], 'test-agent');
      assert.deepEqual(JSON.parse(options.body).payload, payload);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await deliverLead(payload, {
      clientIp: '203.0.113.10',
      userAgent: 'test-agent',
    });
    assert.equal(result.delivery, 'supabase_edge');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
