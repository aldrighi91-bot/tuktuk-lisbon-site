const test = require('node:test');
const assert = require('node:assert/strict');

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
  sanitizeLead,
  validateLead,
} = require('../lib/concierge/lead-store');

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

test('lead validation requires email, date, guests and tour but not phone', () => {
  const lead = sanitizeLead({
    name: 'Alex',
    email: 'alex@example.com',
    desiredDate: 'tomorrow',
    preferredTime: '10 am',
    guests: 2,
    pickupArea: 'Hotel Mundial',
    tourId: 'alfama',
  });
  assert.deepEqual(validateLead(lead), []);
  assert.equal(lead.phone, '');
});

test('missing lead fields are progressive', () => {
  assert.deepEqual(
    missingLeadFields({ tourId: 'belem', desiredDate: 'Friday', guests: 3 }),
    ['preferred time', 'pickup area', 'name', 'email']
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
  assert.equal(nameResponse.leadReady, true);
  assert.equal(nameResponse.ctas[0].action, 'submit_lead');
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
  assert.equal(row.tour, 'Alfama Tour');
  assert.equal(row.tour_slug, 'alfama');
  assert.equal(row.data_tour, 'tomorrow');
  assert.equal(row.hora_tour, '10 am');
  assert.equal(row.pessoas, 2);
  assert.equal(row.pickup, 'Hotel Mundial');
  assert.equal(row.qualificacao, 'HOT');
  assert.equal(row.status, 'novo');
  assert.equal(row.followup_status, 'pendente');
});
