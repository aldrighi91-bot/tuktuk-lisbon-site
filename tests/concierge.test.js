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
    tourId: 'alfama',
  });
  assert.deepEqual(validateLead(lead), []);
  assert.equal(lead.phone, '');
});

test('missing lead fields are progressive', () => {
  assert.deepEqual(missingLeadFields({ tourId: 'belem', desiredDate: 'Friday', guests: 3 }), ['name', 'email', 'preferred time']);
});

test('availability flow expects preferred time before name', () => {
  const response = handleConciergeMessage({
    message: 'We want to book Alfama tomorrow for 2 people. My email is alex@example.com',
    state: { lead: {} },
  });
  assert.equal(response.nextExpectedField, 'preferredTime');
  assert.match(response.reply, /preferred time/i);
});

test('lead capture continues after a short expected-field answer', () => {
  const timeResponse = handleConciergeMessage({
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
  assert.equal(timeResponse.nextExpectedField, 'name');
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
        email: 'alex@example.com',
      },
    },
  });
  assert.equal(nameResponse.leadReady, true);
  assert.equal(nameResponse.ctas[0].action, 'submit_lead');
});
