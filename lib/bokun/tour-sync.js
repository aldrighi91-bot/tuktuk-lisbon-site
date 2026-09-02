const siteTourData = require('../../data/tours.json');

const DEFAULT_ALFAMA_EXPERIENCE_ID = 1276905;
const BOKUN_EXPERIENCE_IDS = {
  alfama: 1276905,
  express: 1278862,
  belem: 1273417,
  chiado: 1273418,
  fullcity: 1273419,
  van: 1273420,
};
const FALLBACK_PRICE_CATALOG_ID = 167638;
const FALLBACK_PRICING_CATEGORY_ID = 1237188;
const FALLBACK_CANCELLATION_POLICY_ID = 269934;
const SYNC_CONFIRMATION = 'UPDATE_BOKUN_TUKTUK_TOURS';
const DEFAULT_AVAILABILITY_START_DATE = '2026-08-20';
const INSTANT_AVAILABILITY_START_DATE = '2026-08-26';
const INSTANT_AVAILABILITY_END_DATE = '2027-12-31';
const ONLINE_TUK_TUK_COUNT = 2;
const VAN_ONLINE_COUNT = 1;

const INSTANT_START_TIMES = {
  alfama: ['09:00', '11:00', '13:00', '15:00', '17:00'],
  express: ['09:00', '11:00', '13:00', '15:00', '17:00'],
  belem: ['09:00', '11:30', '14:00', '16:30'],
  chiado: ['09:00', '11:30', '14:00', '16:30'],
  fullcity: ['09:00', '14:00'],
  van: ['09:00'],
};

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MAIN_PAX_INFO = [
  { type: 'FIRST_NAME', required: true, requiredBeforeDeparture: false },
  { type: 'LAST_NAME', required: true, requiredBeforeDeparture: false },
  { type: 'EMAIL', required: true, requiredBeforeDeparture: false },
  { type: 'PHONE_NUMBER', required: true, requiredBeforeDeparture: false },
];
const DATE_BOOKING_CUTOFF = {
  type: 'RELATIVE_TO_WORKING_HOURS_OPEN',
  minutes: 0,
  hours: 2,
  days: 0,
  weeks: 0,
};

function getOfficialTours() {
  return (siteTourData.tours || []).map((tour) => ({
    id: tour.id,
    name: tour.name,
    shortName: tour.shortName,
    url: tour.url,
    duration: tour.duration,
    durationMinutes: tour.durationMinutes,
    price: tour.price,
    capacity: tour.capacity,
    description: tour.description,
    highlights: tour.highlights || [],
    attractions: tour.attractions || [],
    included: tour.included || [],
    pickup: tour.pickup,
    important: tour.important || [],
  }));
}

function getTourById(tourId) {
  return getOfficialTours().find((tour) => tour.id === tourId) || null;
}

function minutesToDurationParts(durationMinutes) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('Tour duration must be a positive number of minutes');
  }

  return {
    minutes: minutes % 60,
    hours: Math.floor(minutes / 60) % 24,
    days: Math.floor(minutes / (24 * 60)) % 7,
    weeks: Math.floor(minutes / (7 * 24 * 60)),
  };
}

function formatMoneyAmount(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error('Tour price must be a positive number');
  }
  return number.toFixed(6);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlLines(items) {
  return (items || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br />');
}

function buildDescriptionHtml(tour) {
  const sections = [
    escapeHtml(tour.description),
    tour.highlights.length ? `<strong>Highlights</strong><br />${htmlLines(tour.highlights)}` : '',
    tour.attractions.length ? `<strong>Main stops</strong><br />${htmlLines(tour.attractions)}` : '',
    escapeHtml(`${tour.price.label}. ${tour.duration}. ${tour.capacity.label}.`),
  ].filter(Boolean);

  return sections.join('<br /><br />');
}

function buildIncludedHtml(tour) {
  return htmlLines(tour.included);
}

function buildAttentionHtml(tour) {
  return htmlLines([
    ...tour.important,
    `Pickup: ${tour.pickup}`,
    'Final availability and operational details must be confirmed by Tuk Tuk Lisbon Tours.',
  ]);
}

function getPrimaryRate(rates) {
  const allRates = Array.isArray(rates?.rates) ? rates.rates : [];
  if (!allRates.length) return null;
  const defaultId = rates?.defaultRate?.id;
  const defaultExternalId = rates?.defaultRate?.externalId;
  return allRates.find((rate) => (
    (defaultId && rate.id === defaultId) ||
    (defaultExternalId && rate.externalId === defaultExternalId)
  )) || allRates[0];
}

function extractBokunDefaults(current = {}) {
  const rate = getPrimaryRate(current.rates);
  const priceRule = current.pricing?.experiencePriceRules?.[0] || {};
  const catalogCurrency = current.pricing?.priceCatalogCurrencies?.[0] || {};
  const pricingCategoryId = current.pricingCategories?.defaultId ||
    current.pricingCategories?.ids?.[0] ||
    FALLBACK_PRICING_CATEGORY_ID;

  return {
    cancellationPolicyId: rate?.cancellationPolicyId || FALLBACK_CANCELLATION_POLICY_ID,
    priceCatalogId: priceRule.priceCatalogId || catalogCurrency.priceCatalogId || FALLBACK_PRICE_CATALOG_ID,
    pricingCategoryId,
    pricingCategoryIds: current.pricingCategories?.ids || [pricingCategoryId],
    pricingCategories: current.pricingCategories || {
      defaultId: pricingCategoryId,
      ids: [pricingCategoryId],
    },
    priceCatalogCurrencies: current.pricing?.priceCatalogCurrencies || [{
      priceCatalogId: priceRule.priceCatalogId || catalogCurrency.priceCatalogId || FALLBACK_PRICE_CATALOG_ID,
      currencies: ['EUR'],
      defaultCurrency: 'EUR',
    }],
    rate,
    type: current.type || 'DAY_TOUR_OR_ACTIVITY',
    categories: current.categories,
    location: current.location,
    difficultyLevel: current.difficultyLevel || 'EASY',
    minAge: Number.isFinite(current.minAge) ? current.minAge : 0,
    knowBeforeYouGo: current.knowBeforeYouGo,
    cutoff: current.cutoff || {
      type: 'RELATIVE_TO_WORKING_HOURS_OPEN',
      minutes: 0,
      hours: 2,
      days: 0,
      weeks: 0,
    },
    mainPaxInfo: current.mainPaxInfo,
    otherPaxInfo: current.otherPaxInfo,
    meetingType: current.meetingType,
    boxSettings: current.boxSettings || { isBox: false },
    combo: current.combo || { isCombo: false },
    ticket: current.ticket || {
      barcodeFormat: 'CODE_128',
      ticketPerPerson: false,
    },
    bookingLabels: current.bookingLabels || [],
    flags: current.flags || [],
    allowCustomizedBookings: typeof current.allowCustomizedBookings === 'boolean'
      ? current.allowCustomizedBookings
      : false,
    earlyBookingLimit: current.earlyBookingLimit || { limitType: 'UNLIMITED' },
  };
}

function buildDailyOpeningHours(existingOpeningHours) {
  const openingHours = {};
  if (existingOpeningHours?.id) openingHours.id = existingOpeningHours.id;

  WEEKDAYS.forEach((weekday) => {
    const existingInterval = existingOpeningHours?.[weekday]?.timeIntervals?.[0] || {};
    openingHours[weekday] = {
      open24Hours: false,
      timeIntervals: [{
        ...(existingInterval.id ? { id: existingInterval.id } : {}),
        openFrom: { hour: 8, minute: 0 },
        openForHours: 14,
        openForMinutes: 0,
      }],
    };
  });

  return openingHours;
}

function buildCreateLocation(location) {
  if (!location || typeof location !== 'object') return undefined;
  const { id, ...locationWithoutId } = location;
  void id;
  return locationWithoutId;
}

function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (key === 'id') return acc;
    acc[key] = stripIds(item);
    return acc;
  }, {});
}

function buildRate(tour, defaults, options = {}) {
  const existingRate = options.includeExistingIds ? defaults.rate : null;
  const rate = {
    ...(existingRate?.id ? { id: existingRate.id } : {}),
    externalId: existingRate?.externalId || `TUK-${tour.id.toUpperCase()}-GROUP`,
    title: `${tour.name} - Private group`,
    minPerBooking: 1,
    maxPerBooking: tour.capacity.maxGuests,
    pickupSelectionType: 'UNAVAILABLE',
    dropoffSelectionType: 'UNAVAILABLE',
    cancellationPolicyId: defaults.cancellationPolicyId,
    pricedPerPerson: false,
    allPricingCategories: true,
  };

  if (options.bookingType === 'DATE_AND_TIME') {
    rate.allStartTimes = true;
  }

  return rate;
}

function buildRates(tour, defaults, options = {}) {
  const rate = buildRate(tour, defaults, options);
  return {
    defaultRate: rate.id ? { id: rate.id, externalId: rate.externalId } : { externalId: rate.externalId },
    rates: [rate],
  };
}

function buildPrivateGroupPricing(tour, defaults, rate) {
  return {
    experiencePriceRules: [{
      rate: rate.id ? { id: rate.id, externalId: rate.externalId } : { externalId: rate.externalId },
      priceCatalogId: defaults.priceCatalogId,
      currency: tour.price.currency || 'EUR',
      amount: formatMoneyAmount(tour.price.amount),
    }],
    extraPriceRules: [],
    pickupPriceRules: [],
    dropoffPriceRules: [],
    priceCatalogCurrencies: defaults.priceCatalogCurrencies,
  };
}

function buildFlexibleStartTimes(tour) {
  return [{ externalId: `TUK-${tour.id.toUpperCase()}-FLEXIBLE` }];
}

function buildFlexibleAvailabilityRules(tour) {
  return [{
    recurrenceRule: {
      startDate: DEFAULT_AVAILABILITY_START_DATE,
      byWeekday: [],
      byMonth: [],
    },
    maxCapacity: 100,
    minTotalPax: 1,
    allStartTimes: true,
    guidedLanguages: [],
  }];
}

function parseTimeLabel(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) throw new Error(`Invalid start time: ${value}`);
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function buildInstantStartTimes(tour, existingStartTimes = []) {
  const labels = INSTANT_START_TIMES[tour.id] || [];
  if (!labels.length) throw new Error(`No instant start times configured for ${tour.id}`);
  const duration = minutesToDurationParts(tour.durationMinutes);
  const usedExistingIds = new Set();

  return labels.map((label, index) => {
    const { hour, minute } = parseTimeLabel(label);
    const externalId = `TUK-${tour.id.toUpperCase()}-${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
    const existing = (existingStartTimes || []).find((item) => (
      item &&
      !usedExistingIds.has(item.id) &&
      (item.externalId === externalId || (item.hour === hour && item.minute === minute))
    )) || (existingStartTimes || []).find((item, existingIndex) => (
      existingIndex === index &&
      item?.id &&
      !usedExistingIds.has(item.id)
    ));
    if (existing?.id) usedExistingIds.add(existing.id);

    return {
      ...(existing?.id ? { id: existing.id } : {}),
      externalId,
      label,
      hour,
      minute,
      overrideTimeWhenPickup: false,
      durationMinutes: duration.minutes,
      durationHours: duration.hours,
      durationDays: duration.days,
      durationWeeks: duration.weeks,
    };
  });
}

function getOnlineAvailabilityCapacity(tour) {
  if (tour.id === 'van') return VAN_ONLINE_COUNT * tour.capacity.maxGuests;
  return ONLINE_TUK_TUK_COUNT * tour.capacity.maxGuests;
}

function buildInstantAvailabilityRules(tour, existingAvailabilityRules = [], startTimes = []) {
  const existing = Array.isArray(existingAvailabilityRules) ? existingAvailabilityRules[0] : null;
  const existingRecurrence = existing?.recurrenceRule || {};
  const ruleStartTimes = startTimes
    .map((startTime) => ({
      ...(startTime.id ? { id: startTime.id } : {}),
      externalId: startTime.externalId,
    }))
    .filter((startTime) => startTime.id || startTime.externalId);

  return [{
    ...(existing?.id ? { id: existing.id } : {}),
    recurrenceRule: {
      ...(existingRecurrence.id ? { id: existingRecurrence.id } : {}),
      startDate: existingRecurrence.startDate || INSTANT_AVAILABILITY_START_DATE,
      ...(existingRecurrence.endDate ? { endDate: existingRecurrence.endDate } : {}),
      byWeekday: existingRecurrence.byWeekday || [],
      byMonth: existingRecurrence.byMonth || [],
    },
    maxCapacity: getOnlineAvailabilityCapacity(tour),
    minTotalPax: 1,
    allStartTimes: false,
    startTimes: ruleStartTimes,
    guidedLanguages: [],
  }];
}

function buildCommonCommercialComponents(tour, current = {}) {
  const defaults = extractBokunDefaults(current);
  const rates = buildRates(tour, defaults, { includeExistingIds: Boolean(current.id) });
  const rate = rates.rates[0];

  return {
    title: tour.name,
    shortDescription: tour.description,
    description: buildDescriptionHtml(tour),
    type: defaults.type,
    ...(defaults.categories ? { categories: defaults.categories } : {}),
    ...(defaults.location ? { location: defaults.location } : {}),
    difficultyLevel: defaults.difficultyLevel,
    minAge: defaults.minAge,
    privateExperience: true,
    duration: minutesToDurationParts(tour.durationMinutes),
    guidanceTypes: { GUIDED: ['en', 'pt'] },
    ...(defaults.knowBeforeYouGo ? { knowBeforeYouGo: defaults.knowBeforeYouGo } : {}),
    included: buildIncludedHtml(tour),
    attention: buildAttentionHtml(tour),
    defaultOpeningHours: buildDailyOpeningHours(current.defaultOpeningHours),
    cutoff: defaults.cutoff,
    pricingCategories: defaults.pricingCategories,
    rates,
    pricing: buildPrivateGroupPricing(tour, defaults, rate),
    ...(defaults.mainPaxInfo ? { mainPaxInfo: defaults.mainPaxInfo } : {}),
    ...(defaults.otherPaxInfo ? { otherPaxInfo: defaults.otherPaxInfo } : {}),
  };
}

function buildAlfamaUpdatePayload(currentComponents = {}) {
  const tour = getTourById('alfama');
  if (!tour) throw new Error('Alfama tour data was not found');

  return buildCommonCommercialComponents(tour, currentComponents);
}

function buildInstantCheckoutPayload(tour, currentComponents = {}) {
  if (!tour) throw new Error('Tour data was not found');

  const defaults = extractBokunDefaults(currentComponents);
  const startTimes = buildInstantStartTimes(tour, currentComponents.startTimes);
  const rates = buildRates(tour, defaults, {
    includeExistingIds: Boolean(currentComponents.id),
    bookingType: 'DATE_AND_TIME',
  });
  const rate = rates.rates[0];

  return {
    ...buildCommonCommercialComponents(tour, currentComponents),
    bookingType: 'DATE_AND_TIME',
    capacityType: 'LIMITED',
    cutoff: {
      type: 'RELATIVE_TO_START_TIME',
      minutes: 0,
      hours: 2,
      days: 0,
      weeks: 0,
    },
    startTimes,
    availabilityRules: buildInstantAvailabilityRules(
      tour,
      currentComponents.availabilityRules,
      startTimes
    ),
    rates,
    pricing: buildPrivateGroupPricing(tour, defaults, rate),
  };
}

function buildInstantCheckoutOperationalPayload(tour, currentComponents = {}) {
  if (!tour) throw new Error('Tour data was not found');

  const startTimes = buildInstantStartTimes(tour, currentComponents.startTimes);
  return {
    title: currentComponents.title || tour.name,
    bookingType: 'DATE_AND_TIME',
    capacityType: 'LIMITED',
    cutoff: {
      type: 'RELATIVE_TO_START_TIME',
      minutes: 0,
      hours: 2,
      days: 0,
      weeks: 0,
    },
    ...(currentComponents.duration ? { duration: currentComponents.duration } : {}),
    ...(currentComponents.defaultOpeningHours ? { defaultOpeningHours: currentComponents.defaultOpeningHours } : {}),
    startTimes,
    availabilityRules: buildInstantAvailabilityRules(
      tour,
      currentComponents.availabilityRules,
      startTimes
    ),
  };
}

function buildCreateDraftPayload(tour, defaultsFromTemplate = {}) {
  const defaults = extractBokunDefaults(defaultsFromTemplate);
  const rates = buildRates(tour, defaults, { includeExistingIds: false });
  const rate = rates.rates[0];
  const createLocation = buildCreateLocation(defaults.location);
  const createMeetingType = defaults.meetingType ? stripIds(defaults.meetingType) : {
    type: 'MEET_ON_LOCATION',
    meetingPointAddresses: [{
      title: 'Lisbon meeting point',
      address: {
        addressLine1: 'Lisbon',
        city: 'Lisbon',
        countryCode: 'PT',
      },
    }],
    dropoffService: false,
  };

  return {
    externalId: `tuktuk-site-${tour.id}`,
    title: tour.name,
    shortDescription: tour.description,
    description: buildDescriptionHtml(tour),
    type: defaults.type,
    ...(defaults.categories ? { categories: defaults.categories } : {}),
    ...(createLocation ? { location: createLocation } : {}),
    difficultyLevel: defaults.difficultyLevel,
    minAge: defaults.minAge,
    privateExperience: true,
    duration: minutesToDurationParts(tour.durationMinutes),
    guidanceTypes: { GUIDED: ['en', 'pt'] },
    ...(defaults.knowBeforeYouGo ? { knowBeforeYouGo: defaults.knowBeforeYouGo } : {}),
    included: buildIncludedHtml(tour),
    attention: buildAttentionHtml(tour),
    bookingType: 'DATE',
    defaultOpeningHours: buildDailyOpeningHours(),
    cutoff: DATE_BOOKING_CUTOFF,
    capacityType: 'ON_REQUEST',
    startTimes: buildFlexibleStartTimes(tour),
    availabilityRules: buildFlexibleAvailabilityRules(tour),
    meetingType: createMeetingType,
    onRequestDeadline: {
      minutes: 0,
      hours: 2,
      days: 0,
      weeks: 0,
    },
    boxSettings: defaults.boxSettings,
    combo: defaults.combo,
    ticket: defaults.ticket,
    bookingLabels: defaults.bookingLabels,
    flags: defaults.flags,
    allowCustomizedBookings: defaults.allowCustomizedBookings,
    earlyBookingLimit: defaults.earlyBookingLimit,
    pricingCategories: defaults.pricingCategories,
    rates,
    pricing: buildPrivateGroupPricing(tour, defaults, rate),
    mainPaxInfo: MAIN_PAX_INFO,
    ...(defaults.otherPaxInfo ? { otherPaxInfo: defaults.otherPaxInfo } : {}),
    activation: { activated: false },
  };
}

function buildContactInfoUpdatePayload() {
  return {
    mainPaxInfo: MAIN_PAX_INFO,
    otherPaxInfo: [],
  };
}

function buildActivationPayload(activated = true) {
  return {
    activation: {
      activated: Boolean(activated),
    },
  };
}

function buildTourSyncPlan(options = {}) {
  const tours = getOfficialTours();
  const existingAlfamaId = Number(options.existingAlfamaId) || DEFAULT_ALFAMA_EXPERIENCE_ID;

  return {
    confirmation: SYNC_CONFIRMATION,
    existingAlfamaId,
    bokunExperienceIds: BOKUN_EXPERIENCE_IDS,
    source: 'data/tours.json',
    operatingHours: '08:00-22:00 every day',
    pricingModel: 'private group / per booking',
    availabilityStrategy: 'Instant checkout uses DATE_AND_TIME + LIMITED capacity. Configure Bókun Resource Management with Tuk Tuk 1, Tuk Tuk 2, and Van to prevent group-level overbooking across channels.',
    instantCheckout: {
      action: 'enable_instant_checkout',
      capacityType: 'LIMITED',
      bookingType: 'DATE_AND_TIME',
      onlineTukTuks: ONLINE_TUK_TUK_COUNT,
      onlineVans: VAN_ONLINE_COUNT,
      availabilityWindow: {
        startDate: INSTANT_AVAILABILITY_START_DATE,
        endDate: INSTANT_AVAILABILITY_END_DATE,
      },
      startTimes: INSTANT_START_TIMES,
      requiredBeforeLive: [
        'Bókun Resource Management: create Tuk Tuk 1 and Tuk Tuk 2 resources',
        'Assign both tuk tuk resources to Alfama, Belem, Chiado, and Full City',
        'Create and assign one Van resource to Van Full Day Tour',
        'Connect Viator/GetYourGuide products to the same Bókun experiences',
        'Route Lisa/n8n manual bookings into Bókun before confirming to customers',
      ],
    },
    updateExisting: {
      tourId: 'alfama',
      experienceId: existingAlfamaId,
      action: 'update_existing_product',
    },
    createDrafts: tours
      .filter((tour) => tour.id !== 'alfama')
      .map((tour) => ({
        tourId: tour.id,
        title: tour.name,
        duration: tour.duration,
        price: tour.price.label,
        capacity: tour.capacity.label,
        action: 'create_inactive_on_request_product',
      })),
  };
}

module.exports = {
  DEFAULT_ALFAMA_EXPERIENCE_ID,
  INSTANT_AVAILABILITY_END_DATE,
  INSTANT_AVAILABILITY_START_DATE,
  INSTANT_START_TIMES,
  ONLINE_TUK_TUK_COUNT,
  BOKUN_EXPERIENCE_IDS,
  VAN_ONLINE_COUNT,
  SYNC_CONFIRMATION,
  buildActivationPayload,
  buildAlfamaUpdatePayload,
  buildContactInfoUpdatePayload,
  buildCreateDraftPayload,
  buildDailyOpeningHours,
  buildDescriptionHtml,
  buildInstantAvailabilityRules,
  buildInstantCheckoutOperationalPayload,
  buildInstantCheckoutPayload,
  buildInstantStartTimes,
  buildTourSyncPlan,
  extractBokunDefaults,
  formatMoneyAmount,
  getOfficialTours,
  getTourById,
  minutesToDurationParts,
};
