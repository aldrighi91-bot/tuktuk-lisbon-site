const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BOKUN_EXPERIENCE_IDS,
  buildActivationPayload,
  buildAlfamaUpdatePayload,
  buildContactInfoUpdatePayload,
  buildCreateDraftPayload,
  buildInstantCheckoutOperationalPayload,
  buildInstantCheckoutPayload,
  buildTourSyncPlan,
  getTourById,
  minutesToDurationParts,
} = require('../lib/bokun/tour-sync');

const currentAlfama = {
  id: 1272182,
  type: 'DAY_TOUR_OR_ACTIVITY',
  categories: ['CITY_TOURS'],
  location: { id: 1382248, countryCode: 'PT', city: 'Lisbon' },
  difficultyLevel: 'EASY',
  minAge: 0,
  knowBeforeYouGo: ['PUBLIC_TRANSPORTATION_NEARBY'],
  defaultOpeningHours: {
    id: 585122,
    monday: { timeIntervals: [{ id: 9851870 }] },
    tuesday: { timeIntervals: [{ id: 9851871 }] },
    wednesday: { timeIntervals: [{ id: 9851872 }] },
    thursday: { timeIntervals: [{ id: 9851873 }] },
    friday: { timeIntervals: [{ id: 9851874 }] },
    saturday: { timeIntervals: [{ id: 9851875 }] },
    sunday: { timeIntervals: [{ id: 9851876 }] },
  },
  cutoff: {
    type: 'RELATIVE_TO_WORKING_HOURS_OPEN',
    minutes: 0,
    hours: 2,
    days: 0,
    weeks: 0,
  },
  pricingCategories: {
    defaultId: 1237188,
    ids: [1237188, 1237189],
  },
  rates: {
    defaultRate: { id: 2533809, externalId: 'TG1' },
    rates: [{
      id: 2533809,
      externalId: 'TG1',
      title: 'Old rate',
      minPerBooking: 1,
      maxPerBooking: 6,
      pickupSelectionType: 'UNAVAILABLE',
      dropoffSelectionType: 'UNAVAILABLE',
      cancellationPolicyId: 269934,
      pricedPerPerson: true,
      allPricingCategories: true,
    }],
  },
  pricing: {
    experiencePriceRules: [{
      id: 879863793,
      rate: { id: 2533809, externalId: 'TG1' },
      priceCatalogId: 167638,
      currency: 'EUR',
      amount: '110.000000',
      pricingCategoryId: 1237188,
      tierId: 5082765,
    }],
    priceCatalogCurrencies: [{
      priceCatalogId: 167638,
      currencies: ['EUR'],
      defaultCurrency: 'EUR',
    }],
  },
  meetingType: {
    type: 'MEET_ON_LOCATION',
    meetingPointAddresses: [{
      id: 745454,
      title: 'Rua do Comercio',
      address: {
        id: 18876043,
        addressLine1: 'R. do Comercio',
        city: 'Lisboa Lisboa',
        countryCode: 'PT',
      },
    }],
    dropoffService: false,
  },
  boxSettings: { isBox: false },
  combo: { isCombo: false },
  ticket: {
    barcodeFormat: 'CODE_128',
    ticketPerPerson: false,
  },
  bookingLabels: [],
  flags: [],
  allowCustomizedBookings: false,
  earlyBookingLimit: { limitType: 'UNLIMITED' },
};

test('converts minutes to Bókun duration parts', () => {
  assert.deepEqual(minutesToDurationParts(90), {
    minutes: 30,
    hours: 1,
    days: 0,
    weeks: 0,
  });
});

test('builds Alfama update as private group pricing at EUR 130', () => {
  const payload = buildAlfamaUpdatePayload(currentAlfama);
  const rate = payload.rates.rates[0];
  const priceRule = payload.pricing.experiencePriceRules[0];

  assert.equal(payload.title, 'Alfama Tour');
  assert.deepEqual(payload.duration, { minutes: 30, hours: 1, days: 0, weeks: 0 });
  assert.equal(rate.id, 2533809);
  assert.equal(rate.externalId, 'TG1');
  assert.equal(rate.pricedPerPerson, false);
  assert.equal(rate.maxPerBooking, 6);
  assert.equal(priceRule.amount, '130.000000');
  assert.equal(priceRule.currency, 'EUR');
  assert.equal(priceRule.pricingCategoryId, undefined);
  assert.equal(priceRule.tierId, undefined);
});

test('keeps existing opening-hour ids while changing hours to 08:00-22:00', () => {
  const payload = buildAlfamaUpdatePayload(currentAlfama);
  const mondayInterval = payload.defaultOpeningHours.monday.timeIntervals[0];

  assert.equal(payload.defaultOpeningHours.id, 585122);
  assert.equal(mondayInterval.id, 9851870);
  assert.deepEqual(mondayInterval.openFrom, { hour: 8, minute: 0 });
  assert.equal(mondayInterval.openForHours, 14);
  assert.equal(mondayInterval.openForMinutes, 0);
});

test('builds new tour drafts as inactive on-request products', () => {
  const tour = getTourById('belem');
  const payload = buildCreateDraftPayload(tour, currentAlfama);
  const rate = payload.rates.rates[0];
  const priceRule = payload.pricing.experiencePriceRules[0];

  assert.equal(payload.externalId, 'tuktuk-site-belem');
  assert.equal(payload.location.id, undefined);
  assert.equal(payload.location.city, 'Lisbon');
  assert.equal(payload.meetingType.type, 'MEET_ON_LOCATION');
  assert.equal(payload.meetingType.meetingPointAddresses[0].id, undefined);
  assert.equal(payload.meetingType.meetingPointAddresses[0].address.id, undefined);
  assert.equal(payload.activation.activated, false);
  assert.equal(payload.capacityType, 'ON_REQUEST');
  assert.equal(payload.bookingType, 'DATE');
  assert.equal(payload.cutoff.type, 'RELATIVE_TO_WORKING_HOURS_OPEN');
  assert.deepEqual(payload.startTimes, [{ externalId: 'TUK-BELEM-FLEXIBLE' }]);
  assert.equal(payload.availabilityRules[0].recurrenceRule.startDate, '2026-08-20');
  assert.equal(payload.availabilityRules[0].allStartTimes, true);
  assert.equal(payload.availabilityRules[0].startTimes, undefined);
  assert.equal(payload.availabilityRules[0].maxCapacityForPickup, undefined);
  assert.equal(payload.difficultyLevel, 'EASY');
  assert.equal(payload.minAge, 0);
  assert.deepEqual(payload.knowBeforeYouGo, ['PUBLIC_TRANSPORTATION_NEARBY']);
  assert.deepEqual(payload.boxSettings, { isBox: false });
  assert.deepEqual(payload.combo, { isCombo: false });
  assert.equal(payload.ticket.barcodeFormat, 'CODE_128');
  assert.equal(payload.ticket.ticketPerPerson, false);
  assert.equal(payload.inventorySettings, undefined);
  assert.deepEqual(payload.mainPaxInfo.map((field) => field.type), [
    'FIRST_NAME',
    'LAST_NAME',
    'EMAIL',
    'PHONE_NUMBER',
  ]);
  assert.equal(rate.pricedPerPerson, false);
  assert.equal(rate.maxPerBooking, 6);
  assert.equal(priceRule.amount, '190.000000');
  assert.equal(priceRule.pricingCategoryId, undefined);
});

test('documents safe availability strategy in the sync plan', () => {
  const plan = buildTourSyncPlan();

  assert.equal(plan.updateExisting.experienceId, 1276905);
  assert.equal(plan.bokunExperienceIds.belem, 1273417);
  assert.equal(plan.createDrafts.length, 4);
  assert.match(plan.availabilityStrategy, /Resource Management/i);
  assert.equal(plan.instantCheckout.onlineTukTuks, 2);
  assert.deepEqual(plan.instantCheckout.startTimes.belem, ['09:00', '11:30', '14:00', '16:30']);
});

test('builds instant checkout payload with limited capacity and explicit start times', () => {
  const tour = getTourById('belem');
  const payload = buildInstantCheckoutPayload(tour, {
    ...currentAlfama,
    startTimes: [{ id: 42, externalId: 'TUK-BELEM-0900', hour: 9, minute: 0 }],
    availabilityRules: [{
      id: 77,
      recurrenceRule: { id: 88, startDate: '2026-08-20' },
      maxCapacity: 100,
    }],
  });

  assert.equal(payload.bookingType, 'DATE_AND_TIME');
  assert.equal(payload.capacityType, 'LIMITED');
  assert.deepEqual(
    payload.startTimes.map((item) => `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`),
    ['09:00', '11:30', '14:00', '16:30']
  );
  assert.equal(payload.startTimes[0].id, 42);
  assert.equal(payload.availabilityRules[0].id, 77);
  assert.equal(payload.availabilityRules[0].recurrenceRule.id, 88);
  assert.equal(payload.availabilityRules[0].recurrenceRule.startDate, '2026-08-20');
  assert.equal(payload.availabilityRules[0].recurrenceRule.endDate, undefined);
  assert.equal(payload.availabilityRules[0].maxCapacity, 12);
  assert.equal(payload.availabilityRules[0].allStartTimes, false);
  assert.deepEqual(
    payload.availabilityRules[0].startTimes.map((item) => item.externalId),
    ['TUK-BELEM-0900', 'TUK-BELEM-1130', 'TUK-BELEM-1400', 'TUK-BELEM-1630']
  );
  assert.equal(payload.rates.rates[0].allStartTimes, true);
});

test('builds operational instant checkout payload without replacing price rules', () => {
  const tour = getTourById('belem');
  const payload = buildInstantCheckoutOperationalPayload(tour, currentAlfama);

  assert.equal(payload.bookingType, 'DATE_AND_TIME');
  assert.equal(payload.capacityType, 'LIMITED');
  assert.equal(payload.rates, undefined);
  assert.equal(payload.pricing, undefined);
  assert.equal(payload.availabilityRules[0].maxCapacity, 12);
});

test('limits van instant checkout to the dedicated van capacity', () => {
  const tour = getTourById('van');
  const payload = buildInstantCheckoutPayload(tour, currentAlfama);

  assert.deepEqual(
    payload.startTimes.map((item) => `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`),
    ['09:00']
  );
  assert.equal(payload.availabilityRules[0].maxCapacity, 8);
});

test('keeps the created Bókun IDs and contact update payload explicit', () => {
  const payload = buildContactInfoUpdatePayload();

  assert.equal(BOKUN_EXPERIENCE_IDS.chiado, 1273418);
  assert.deepEqual(payload.mainPaxInfo.map((field) => field.type), [
    'FIRST_NAME',
    'LAST_NAME',
    'EMAIL',
    'PHONE_NUMBER',
  ]);
  assert.deepEqual(payload.otherPaxInfo, []);
});

test('builds explicit activation payload for created drafts', () => {
  assert.deepEqual(buildActivationPayload(true), {
    activation: { activated: true },
  });
});
