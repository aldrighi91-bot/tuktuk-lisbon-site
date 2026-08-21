const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  buildEdgeLeadPayload,
  canonicalBokunHeaders,
  decodeBokunGraphqlId,
  isAuthorizedWebhook,
  normalizeBokunBooking,
  processBokunBookingWebhook,
  upsertBookingInSupabase,
  verifyBokunHmac,
} = require('../lib/bokun/booking-sync');

async function withEnv(env, callback) {
  const original = {};
  Object.keys(env).forEach((key) => {
    original[key] = process.env[key];
    if (env[key] == null) delete process.env[key];
    else process.env[key] = env[key];
  });

  try {
    return await callback();
  } finally {
    Object.entries(original).forEach(([key, value]) => {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

const sampleBooking = {
  bookingId: 101401400,
  confirmationCode: 'TUK-101401400',
  status: 'CONFIRMED',
  currency: 'EUR',
  totalPrice: 130,
  totalPaid: 26,
  totalDue: 104,
  paymentType: 'DEPOSIT',
  creationDate: '2026-08-20T18:35:00Z',
  customer: {
    firstName: 'Arthur',
    lastName: 'Aldrighi',
    email: 'arthur@example.com',
    phoneNumberCountryCode: '1',
    phoneNumber: '4155550199',
  },
  activityBookings: [
    {
      id: 999,
      productConfirmationCode: 'TUK-A1',
      date: '2026-08-28T10:00:00',
      startTime: '10:00',
      totalParticipants: 2,
      totalPrice: 130,
      paidType: 'DEPOSIT',
      product: {
        id: 1272182,
        title: 'Alfama Tour',
      },
    },
  ],
};

test('decodes Bókun GraphQL booking IDs for REST lookup', () => {
  assert.equal(decodeBokunGraphqlId(Buffer.from('Booking:37648').toString('base64')), '37648');
  assert.equal(decodeBokunGraphqlId('TUK-101401400'), 'TUK-101401400');
});

test('verifies Bókun webhook HMAC headers', () => {
  const headers = {
    'x-bokun-topic': 'booking.confirmed',
    'x-bokun-webhook-id': 'webhook-1',
    'x-bokun-attempt': '1',
  };
  const canonical = canonicalBokunHeaders(headers);
  const hmac = crypto.createHmac('sha256', 'secret').update(canonical).digest('hex');

  assert.equal(verifyBokunHmac({ ...headers, 'x-bokun-hmac': hmac }, 'secret'), true);
  assert.equal(verifyBokunHmac({ ...headers, 'x-bokun-hmac': 'bad' }, 'secret'), false);
});

test('authorizes token fallback for manually configured Bókun webhooks', () => withEnv({
  BOKUN_BOOKING_WEBHOOK_TOKEN: 'webhook-token',
  BOKUN_SECRET_KEY: null,
}, () => {
  assert.equal(isAuthorizedWebhook({ headers: {}, query: { token: 'webhook-token' } }), true);
  assert.equal(isAuthorizedWebhook({ headers: {}, query: { token: 'wrong' } }), false);
}));

test('normalizes Bókun booking details into the Tuk Tuk lead pattern', () => {
  const normalized = normalizeBokunBooking({
    payload: { event: 'booking.confirmed' },
    booking: sampleBooking,
    headers: { 'x-bokun-topic': 'booking.confirmed' },
  });

  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.bookingReference, 'TUK-101401400');
  assert.equal(normalized.productConfirmationCode, 'TUK-A1');
  assert.equal(normalized.status, 'reserva_bokun_confirmada');
  assert.equal(normalized.name, 'Arthur Aldrighi');
  assert.equal(normalized.email, 'arthur@example.com');
  assert.equal(normalized.phone, '+1 4155550199');
  assert.equal(normalized.tourId, 'alfama');
  assert.equal(normalized.tourName, 'Alfama Tour');
  assert.equal(normalized.desiredDate, '2026-08-28');
  assert.equal(normalized.preferredTime, '10:00');
  assert.equal(normalized.guests, 2);
  assert.equal(normalized.totalPrice, 130);
  assert.equal(normalized.depositPaid, 26);
  assert.equal(normalized.remainingDue, 104);

  const edgeLead = buildEdgeLeadPayload(normalized);
  assert.equal(edgeLead.source, 'bokun_checkout');
  assert.equal(edgeLead.qualification, 'HOT');
  assert.equal(edgeLead.bokun.paymentStatus, 'DEPOSIT');
});

test('booking webhook fetches Bókun details and falls back to the Supabase lead Edge Function', async () => {
  const originalFetch = global.fetch;
  const bookingId = Buffer.from('Booking:37648').toString('base64');

  await withEnv({
    BOKUN_ACCESS_KEY: 'access',
    BOKUN_SECRET_KEY: 'secret',
    SUPABASE_URL: null,
    SUPABASE_SERVICE_ROLE_KEY: null,
    SUPABASE_EDGE_LEAD_URL: 'https://example.test/functions/v1/tuktuk-site-lead',
    BOKUN_BOOKING_FORWARD_URL: null,
  }, async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://api.bokun.io/booking.json/booking/37648') {
        assert.equal(options.method, 'GET');
        assert.equal(options.headers['X-Bokun-AccessKey'], 'access');
        return new Response(JSON.stringify(sampleBooking), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://example.test/functions/v1/tuktuk-site-lead') {
        const body = JSON.parse(options.body);
        assert.equal(body.payload.source, 'bokun_checkout');
        assert.equal(body.payload.name, 'Arthur Aldrighi');
        assert.equal(body.payload.tourId, 'alfama');
        assert.equal(body.payload.bokun.bookingReference, 'TUK-101401400');
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch ${url}`);
    };

    try {
      const result = await processBokunBookingWebhook({ bookingId }, {
        headers: { 'x-bokun-topic': 'booking.confirmed' },
        clientIp: '203.0.113.10',
        userAgent: 'test-agent',
      });

      assert.equal(result.ok, true);
      assert.equal(result.delivery, 'supabase_edge');
      assert.equal(result.fetchedFromBokun, true);
      assert.equal(calls.length, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('direct Supabase delivery upserts client, reservation and a single booking lead', async () => {
  const originalFetch = global.fetch;
  const normalized = normalizeBokunBooking({
    payload: { event: 'booking.confirmed' },
    booking: sampleBooking,
  });

  await withEnv({
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  }, async () => {
    const requests = [];
    global.fetch = async (url, options) => {
      requests.push({ url, options });
      if (url === 'https://supabase.example/rest/v1/Clientes%20-%20Tuk%20Tuk?on_conflict=telefone') {
        return new Response(JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111' }]), { status: 201 });
      }
      if (url === 'https://supabase.example/rest/v1/Reservas?on_conflict=ticket_id') {
        const body = JSON.parse(options.body);
        assert.equal(body.ticket_id, 'TUK-101401400');
        assert.equal(body.deposito, 26);
        assert.equal(body.restante, 104);
        return new Response(JSON.stringify([{ id: 42 }]), { status: 201 });
      }
      if (url === 'https://supabase.example/rest/v1/Leads%20-%20Tuk%20Tuk?select=id&reserva_id=eq.42&origem=eq.bokun_checkout&limit=1') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url === 'https://supabase.example/rest/v1/Leads%20-%20Tuk%20Tuk') {
        const body = JSON.parse(options.body);
        assert.equal(body.origem, 'bokun_checkout');
        assert.equal(body.canal, 'bokun');
        assert.equal(body.reserva_id, 42);
        assert.equal(body.qualificacao, 'HOT');
        return new Response(JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222' }]), { status: 201 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    };

    try {
      const result = await upsertBookingInSupabase(normalized);
      assert.equal(result.delivery, 'supabase');
      assert.equal(result.reservaId, 42);
      assert.equal(result.leadAction, 'inserted');
      assert.equal(requests.length, 4);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
