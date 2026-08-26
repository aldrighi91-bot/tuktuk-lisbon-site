const tourData = require('../../data/tours.json');

const HOT_PATTERNS = [
  /\b(book|booking|reserve|reservation|available|availability|pay|payment|confirm)\b/i,
  /\b(today|tomorrow|tonight|this week|at\s+\d{1,2}(:\d{2})?\s?(am|pm)?)\b/i,
  /\bwe want to book\b/i,
];

const WARM_PATTERNS = [
  /\b(price|cost|how much|duration|how long|compare|best tour|pickup|pick up|hotel|group|people|guests|passengers)\b/i,
];

const PORTUGUESE_PATTERNS = [
  /\b(ol[aá]|pre[cç]o|quanto|reserva|disponibilidade|pessoas|dura[cç][aã]o|passeio|obrigad[oa])\b/i,
];

const TOUR_KEYWORDS = {
  alfama: /\b(alfama|fado|old town|historic|historical|medieval|viewpoint|viewpoints|miradouro|miradouros|authentic|local)\b/i,
  belem: /\b(belem|bel[eé]m|discoveries|jeronimos|jer[oó]nimos|tower|pasteis|past[eé]is|monuments|unesco|river)\b/i,
  chiado: /\b(chiado|bairro alto|baixa|bica|bohemian|culture|cultural|art|downtown|central)\b/i,
  fullcity: /\b(full city|complete|all districts|as much as possible|whole city|everything|4h|4 hours|half day)\b/i,
  van: /\b(van|sintra|cascais|cabo|obidos|[oó]bidos|nazare|nazar[eé]|fatima|f[aá]tima|evora|[eé]vora|day trip|outside lisbon|beyond lisbon|full day|8h|8 hours)\b/i,
};

const INTEREST_TO_TOUR = {
  'Historic Lisbon': 'alfama',
  'Belem & Portuguese Discoveries': 'belem',
  'See as much as possible': 'fullcity',
  'Local & authentic Lisbon': 'alfama',
  'Not sure - help me choose': 'alfama',
};

const LEAD_EXPECTED_FIELDS = ['tourId', 'desiredDate', 'preferredTime', 'guests', 'pickupArea', 'name', 'email', 'phone'];

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getTours() {
  return tourData.tours;
}

function findTourById(id) {
  return getTours().find((tour) => tour.id === id) || null;
}

function detectLanguage(message = '') {
  return PORTUGUESE_PATTERNS.some((pattern) => pattern.test(message)) ? 'pt' : 'en';
}

function classifyIntent(message = '') {
  if (HOT_PATTERNS.some((pattern) => pattern.test(message))) return 'HOT';
  if (WARM_PATTERNS.some((pattern) => pattern.test(message))) return 'WARM';
  return 'INFORMATIONAL';
}

function detectTourId(message = '') {
  for (const [tourId, pattern] of Object.entries(TOUR_KEYWORDS)) {
    if (pattern.test(message)) return tourId;
  }
  return null;
}

function parseGuests(message = '') {
  const text = normalizeText(message);
  const range = text.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(people|guests|passengers|persons|pax|pessoas|pessoa)\b/);
  if (range) return Number(range[2]);
  const match = text.match(/\b(\d{1,2})\s*(people|guests|passengers|persons|pax|pessoas|pessoa)\b/);
  if (match) return Number(match[1]);
  const simple = text.match(/\bwe are\s+(\d{1,2})\b|\bfor\s+(\d{1,2})\b/);
  if (simple) return Number(simple[1] || simple[2]);
  return null;
}

function parseEmail(message = '') {
  const match = String(message).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].slice(0, 120) : null;
}

function parsePhone(message = '', expectedField = '') {
  const source = String(message);
  const match = source.match(/(?:\+|00)?[\d\s().-]{7,24}/);
  if (!match) return null;
  const phone = match[0].replace(/\s+/g, ' ').trim();
  const digitCount = phone.replace(/\D/g, '').length;
  const hasPhoneContext = expectedField === 'phone'
    || /\b(phone|mobile|cell|sms|whatsapp|whats app|tel|telefone|telemovel|celular)\b/i.test(source)
    || /(?:\+|00)\s?\d/.test(source);
  if (!hasPhoneContext && /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(phone)) return null;
  if (!hasPhoneContext && digitCount < 9) return null;
  return digitCount >= 7 && digitCount <= 15 ? phone.slice(0, 60) : null;
}

function applyPhonePatch(patch, phone) {
  if (phone) {
    patch.phone = phone;
    patch.phoneConsent = true;
    patch.phoneConsentText = 'Customer provided a mobile number for SMS or WhatsApp updates about this tour request.';
    patch.contactPreference = 'sms_whatsapp';
  }
}

function parsePreferredTime(message = '') {
  const text = normalizeText(message);
  const period = text.match(/\b(morning|afternoon|evening|noon|flexible|not sure yet|not sure)\b/);
  if (period) return period[0].trim();
  const match = String(message).match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\s?(am|pm)?\b/i);
  if (!match) return null;
  const value = match[0].trim();
  if (/^\d{1,2}$/.test(value) && Number(value) > 12) return `${value}:00`;
  return value;
}

function parseDesiredDate(message = '') {
  const text = String(message);
  const iso = text.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/);
  if (iso) return iso[1];
  const european = text.match(/\b(\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?)\b/);
  if (european) return european[1];
  const named = text.match(/\b(today|tomorrow|this weekend|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b[^.,;!?]*/i);
  return named ? named[0].trim().slice(0, 80) : null;
}

function cleanLeadAnswer(message = '') {
  return String(message).replace(/\s+/g, ' ').trim();
}

function parsePickupArea(message = '', expectedField = '') {
  const clean = cleanLeadAnswer(message).slice(0, 180);
  const text = normalizeText(message);
  if (!clean) return null;
  if (expectedField === 'pickupArea') return clean;
  if (/\b(no pickup|meeting point|not sure|central lisbon|hotel pickup|airport|cruise port|cruise terminal|hotel|pickup|pick up|staying at|staying in)\b/.test(text)) {
    return clean;
  }
  return null;
}

function mergeLead(existing = {}, message = '', expectedField = '') {
  const patch = {};
  const email = parseEmail(message);
  const phone = parsePhone(message, expectedField);
  const guests = parseGuests(message);
  const time = parsePreferredTime(message);
  const date = parseDesiredDate(message);
  const tourId = detectTourId(message);
  const pickupArea = parsePickupArea(message, expectedField);
  const clean = cleanLeadAnswer(String(message).replace(email || '', '').replace(phone || '', ''));

  if (expectedField && LEAD_EXPECTED_FIELDS.includes(expectedField)) {
    if (email) patch.email = email;
    applyPhonePatch(patch, phone);
    if (tourId) patch.tourId = tourId;

    if (expectedField === 'tourId' && clean && !patch.tourId && clean.length <= 120) patch.message = `Tour interest: ${clean}`;
    if (expectedField === 'desiredDate' && clean && clean.length <= 80) patch.desiredDate = date || clean;
    if (expectedField === 'preferredTime' && clean && clean.length <= 40) patch.preferredTime = time || clean;
    if (expectedField === 'guests') {
      const numeric = Number(clean.match(/\b\d{1,2}\b/g)?.pop() || 0);
      const guestCount = guests || (Number.isInteger(numeric) && numeric > 0 ? numeric : null);
      if (guestCount) patch.guests = guestCount;
    }
    if (expectedField === 'pickupArea' && pickupArea) patch.pickupArea = pickupArea;
    if (expectedField === 'name' && clean && clean.length <= 80) patch.name = clean;
    if (expectedField === 'email' && email) patch.email = email;
    if (expectedField === 'phone') {
      applyPhonePatch(patch, phone);
    }

    return { ...existing, ...patch };
  }

  if (email) patch.email = email;
  applyPhonePatch(patch, phone);
  if (guests) patch.guests = guests;
  if (time && !email) patch.preferredTime = time;
  if (date) patch.desiredDate = date;
  if (tourId) patch.tourId = tourId;
  if (pickupArea) patch.pickupArea = pickupArea;

  if (expectedField === 'question' && clean && clean.length <= 600) patch.message = clean;

  return { ...existing, ...patch };
}

function inferMinutesFromText(message = '') {
  const text = normalizeText(message);
  const hourMatch = text.match(/\b(\d(?:\.\d)?)\s*(h|hour|hours|hr|hrs)\b/);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);
  if (/\b(90 minutes|1h30|1\.5h|one and a half)\b/.test(text)) return 90;
  if (/\b(short|quick|less than two hours|limited time)\b/.test(text)) return 90;
  return null;
}

function chooseRecommendedTour({ message = '', lead = {}, finder = {} }) {
  const explicit = lead.tourId || detectTourId(message);
  if (explicit) return findTourById(explicit);

  const interestTourId = INTEREST_TO_TOUR[finder.interest];
  if (interestTourId) return findTourById(interestTourId);

  const minutes = inferMinutesFromText(message) || Number(finder.minutes || 0);
  if (minutes >= 210) return findTourById('fullcity');
  if (minutes > 0 && minutes <= 100) return findTourById('alfama');
  if (minutes > 100 && minutes < 210 && /discover|belem|monument|river|unesco/i.test(message)) {
    return findTourById('belem');
  }

  if (Number(lead.guests) > 6 && Number(lead.guests) <= 8 && /day|sintra|cascais|outside|van/i.test(message)) {
    return findTourById('van');
  }

  return null;
}

function capacityNote(guests) {
  const count = Number(guests || 0);
  if (!count) return null;
  if (count <= 6) return 'Your group fits within one tuk tuk capacity. Availability is confirmed when Bókun accepts the selected date and time.';
  if (count <= 12) return 'Each tuk tuk seats up to 6 guests and Tuk Tuk Lisbon operates 2 tuk tuks. Availability is confirmed through Bókun for the selected date and time.';
  return 'For more than 12 guests, Natanael should confirm whether a custom arrangement is possible before any booking is promised.';
}

function tourSummary(tour) {
  return `${tour.name} - ${tour.duration}, ${tour.price.label}, ${tour.capacity.label}.`;
}

function buildTourRecommendation(tour, lead = {}, lang = 'en') {
  const note = capacityNote(lead.guests);
  if (lang === 'pt') {
    return [
      `Acho que vai gostar do ${tour.name}.`,
      '',
      `${tour.description} Dura ${tour.duration} e o valor no site e ${tour.price.label}.`,
      note ? `\n${note}` : '',
      'Posso pedir data, horario, numero de pessoas e pickup para abrir o checkout Bókun ou criar a reserva no Bókun antes de confirmar.'
    ].filter(Boolean).join('\n');
  }

  return [
    `I think you'll love our ${tour.name}.`,
    '',
    `${tour.description} It takes ${tour.duration} and the official site lists it at ${tour.price.label}.`,
    tour.highlights.length ? `Highlights include ${tour.highlights.slice(0, 3).join(', ')}.` : '',
    note || '',
    'I can collect your date, preferred time, group size and pickup area so the booking can be checked or created in Bókun before it is confirmed.'
  ].filter(Boolean).join('\n');
}

function missingLeadFields(lead = {}) {
  const missing = [];
  if (!lead.tourId) missing.push('tour of interest');
  if (!lead.desiredDate) missing.push('desired date');
  if (!lead.preferredTime) missing.push('preferred time');
  if (!lead.guests) missing.push('number of guests');
  if (!lead.pickupArea) missing.push('pickup area');
  if (!lead.name) missing.push('name');
  if (!lead.email) missing.push('email');
  if (!lead.phone) missing.push('phone');
  return missing;
}

function needsPhone(lead = {}) {
  return !lead.phone;
}

function nextLeadQuestion(lead = {}, lang = 'en') {
  if (!lead.tourId) return lang === 'pt' ? 'Qual tour ou zona lhe interessa mais: Alfama, Belem, Chiado, Full City ou Van?' : 'Which tour or area are you interested in: Alfama, Belem, Chiado, Full City, or Van?';
  if (!lead.desiredDate) return lang === 'pt' ? 'Em que data pretende visitar Lisboa?' : 'When are you visiting Lisbon?';
  if (!lead.preferredTime) return lang === 'pt' ? 'Tem algum horario preferido?' : 'Do you have a preferred time?';
  if (!lead.guests) return lang === 'pt' ? 'Quantas pessoas vao viajar?' : 'How many people are traveling?';
  if (!lead.pickupArea) return lang === 'pt' ? 'Onde pretende o pickup? Pode enviar hotel/zona, aeroporto, terminal de cruzeiros ou dizer que ainda nao sabe.' : 'Where should Natanael plan pickup? You can share your hotel/area, airport, cruise terminal, or say not sure yet.';
  if (!lead.name) return lang === 'pt' ? 'Qual e o seu nome?' : 'What name should Natanael use for the request?';
  if (!lead.email) return lang === 'pt' ? 'Qual email devo usar para a resposta?' : 'What email should Natanael use to reply?';
  if (needsPhone(lead)) {
    return lang === 'pt'
      ? 'Qual telefone devemos usar para atualizacoes por SMS ou WhatsApp sobre este pedido?'
      : 'What mobile number should Natanael use for SMS or WhatsApp updates about this request?';
  }
  return null;
}

function nextExpectedLeadField(lead = {}) {
  if (!lead.tourId) return 'tourId';
  if (!lead.desiredDate) return 'desiredDate';
  if (!lead.preferredTime) return 'preferredTime';
  if (!lead.guests) return 'guests';
  if (!lead.pickupArea) return 'pickupArea';
  if (!lead.name) return 'name';
  if (!lead.email) return 'email';
  if (needsPhone(lead)) return 'phone';
  return '';
}

function quickRepliesForLeadField(field = '') {
  if (field === 'tourId') return ['Alfama', 'Belem', 'Chiado', 'Full City', 'Van'];
  if (field === 'desiredDate') return ['Today', 'Tomorrow', 'This weekend', 'Next week'];
  if (field === 'preferredTime') return ['Morning', 'Afternoon', '10 am', 'Flexible'];
  if (field === 'guests') return ['2 people', '4 people', '6 people', '7-8 people'];
  if (field === 'pickupArea') return ['Hotel pickup', 'Central Lisbon', 'Airport / cruise port', 'Not sure yet'];
  if (field === 'phone') return [];
  return [];
}

function startTourFinder(lang = 'en') {
  return {
    reply: lang === 'pt'
      ? 'Claro. Para escolher bem, quanto tempo tem para o passeio?'
      : 'Sure. To choose well, how much time do you have?',
    quickReplies: ['Up to 90 minutes', 'Around 2 hours', 'Half day / 4 hours', 'Full day'],
    nextExpectedField: 'time',
    finderPatch: { active: true, step: 'time' },
  };
}

function continueTourFinder({ message, state, lang }) {
  const finder = { ...(state.finder || {}) };
  const text = normalizeText(message);

  if (finder.step === 'time') {
    if (/90|1h|short|quick/.test(text)) finder.minutes = 90;
    if (/2|two/.test(text)) finder.minutes = 120;
    if (/4|half/.test(text)) finder.minutes = 240;
    if (/full|day|8/.test(text)) finder.minutes = 480;
    finder.step = 'interest';
    return {
      reply: lang === 'pt'
        ? 'Perfeito. O que gostaria mais de experienciar?'
        : 'Perfect. What would you most like to experience?',
      quickReplies: [
        'Historic Lisbon',
        'Belem & Portuguese Discoveries',
        'See as much as possible',
        'Local & authentic Lisbon',
        'Not sure - help me choose'
      ],
      finderPatch: finder,
    };
  }

  if (finder.step === 'interest') {
    finder.interest = message;
    finder.step = 'guests';
    return {
      reply: lang === 'pt'
        ? 'Quantas pessoas vao viajar?'
        : 'How many people are traveling?',
      quickReplies: ['2 people', '4 people', '6 people', '7-8 people'],
      finderPatch: finder,
    };
  }

  if (finder.step === 'guests') {
    finder.guests = parseGuests(message) || Number(String(message).match(/\d{1,2}/)?.[0] || 0) || null;
    finder.step = 'date';
    return {
      reply: lang === 'pt'
        ? 'E quando visita Lisboa? Pode dizer a data aproximada.'
        : 'And when are you visiting Lisbon? An approximate date is fine.',
      quickReplies: ['Today', 'Tomorrow', 'This weekend', 'Next week'],
      finderPatch: finder,
      leadPatch: finder.guests ? { guests: finder.guests } : {},
    };
  }

  if (finder.step === 'date') {
    finder.date = parseDesiredDate(message) || message.slice(0, 80);
    finder.active = false;
    finder.step = 'done';
    const lead = mergeLead(state.lead || {}, message);
    if (finder.guests) lead.guests = finder.guests;
    if (finder.date) lead.desiredDate = finder.date;
    const tour = chooseRecommendedTour({ message, lead, finder }) || findTourById(INTEREST_TO_TOUR[finder.interest] || 'alfama');
    lead.tourId = lead.tourId || tour.id;
    return {
      reply: buildTourRecommendation(tour, lead, lang),
      quickReplies: ['Check availability', 'View Tour', 'Ask a question'],
      ctas: buildTourCtas(tour),
      finderPatch: finder,
      leadPatch: lead,
      recommendedTour: tour.id,
      analytics: ['tour_recommended'],
    };
  }

  return null;
}

function buildTourCtas(tour) {
  if (!tour) return [];
  return [
    { label: 'Book Online', action: 'book_online', tourId: tour.id },
    { label: 'View Tour', action: 'link', href: tour.url },
    { label: 'Check Availability', action: 'check_availability', tourId: tour.id },
    { label: 'WhatsApp', action: 'whatsapp', tourId: tour.id },
  ];
}

function answerKnownQuestion(message = '', lead = {}, lang = 'en') {
  const text = normalizeText(message);
  const tour = chooseRecommendedTour({ message, lead });
  if (tour && /\b(price|cost|how much|duration|how long|included|pickup|pick up|hotel|people|capacity)\b/i.test(message)) {
    const parts = [tourSummary(tour)];
    if (/included/.test(text)) parts.push(`Included: ${tour.included.join('; ')}.`);
    if (/pickup|pick up|hotel/.test(text)) parts.push(`Pickup: ${tour.pickup}.`);
    if (/capacity|people|guests/.test(text)) parts.push(capacityNote(lead.guests) || tour.capacity.label);
    parts.push('Availability is confirmed through Bókun, so I should not promise a date or time unless Bókun accepts or holds it.');
    return {
      reply: parts.join('\n\n'),
      quickReplies: ['Check availability', 'Compare tours', 'Find the right tour'],
      ctas: buildTourCtas(tour),
      recommendedTour: tour.id,
    };
  }

  if (/\b(compare|difference|best tour|which tour)\b/i.test(message)) {
    return {
      reply: [
        'Quick guide:',
        '',
        '- Alfama: best for historic Lisbon, old streets and viewpoints.',
        '- Belem: best for monuments, river views and Portuguese Discoveries.',
        '- Chiado & Bairro Alto: best for culture, downtown and bohemian Lisbon.',
        '- Full City: best if you want to see as much of Lisbon as possible in 4 hours.',
        '- Van: best for a full day beyond Lisbon, such as Sintra or Cascais.',
        '',
        'Tell me your time, interests and group size, and I will recommend one.'
      ].join('\n'),
      quickReplies: ['Find the right tour', 'Historic Lisbon', 'See as much as possible'],
    };
  }

  if (/\b(pay|payment|deposit|card|cash)\b/i.test(message)) {
    return {
      reply: 'Online booking uses a secure Bókun checkout with a 20% deposit. The remaining balance is paid in person on the tour day by card or cash. If you prefer, Natanael can still help you by message before you book.',
      quickReplies: ['Check availability', 'How do I book?', 'Ask a question'],
    };
  }

  if (/\b(pickup|pick up|hotel|meeting point|meet)\b/i.test(message)) {
    return {
      reply: 'Pickup is flexible in Lisbon for the tuk tuk tours. The Van Full Day Tour page mentions hotel and airport pickup. Natanael confirms the exact pickup point before the tour.',
      quickReplies: ['Check availability', 'Find the right tour', 'Ask a question'],
    };
  }

  return null;
}

function availabilityReply(lead = {}, lang = 'en') {
  const tour = findTourById(lead.tourId);
  const note = capacityNote(lead.guests);
  const missing = missingLeadFields(lead);
  const question = nextLeadQuestion(lead, lang);

  const intro = lang === 'pt'
    ? 'Posso recolher os detalhes no mesmo padrao da Lisa: tour/zona, data, horario, pessoas, pickup e contato. A disponibilidade so deve ser confirmada depois que o Bókun aceitar ou segurar a reserva.'
    : 'Let me check availability for you. I will collect the same booking details Lisa asks for: tour/area, date, time, guests, pickup and contact. Availability is confirmed only after Bókun accepts or holds the booking.';

  return {
    reply: [
      intro,
      tour ? `\nTour: ${tourSummary(tour)}` : '',
      note ? `\n${note}` : '',
      question ? `\n${question}` : '\nI have the key details. You can send this request to Natanael now or continue with the secure Bókun checkout.',
    ].filter(Boolean).join('\n'),
    quickReplies: question ? quickRepliesForLeadField(nextExpectedLeadField(lead)) : ['Send request to Natanael', 'Add a question'],
    ctas: question ? [] : [{ label: 'Send request', action: 'submit_lead' }],
    leadReady: !question,
    missingFields: missing,
    nextExpectedField: nextExpectedLeadField(lead) || 'question',
  };
}

function continueLeadCapture(lead = {}, lang = 'en', qualification = 'WARM') {
  const question = nextLeadQuestion(lead, lang);
  if (question) {
    const expected = nextExpectedLeadField(lead);
    const note = expected === 'pickupArea' ? capacityNote(lead.guests) : null;
    return {
      reply: [note, question].filter(Boolean).join('\n\n'),
      quickReplies: quickRepliesForLeadField(expected),
      ctas: [],
      leadPatch: lead,
      qualification,
      nextExpectedField: expected,
      analytics: ['lead_started'],
    };
  }

  return {
    reply: 'I have the key details. You can send this request to Natanael now or continue with the secure Bókun checkout. A WhatsApp booking should only be confirmed after it is created or held in Bókun.',
    quickReplies: ['Send request to Natanael', 'Add a question'],
    ctas: [{ label: 'Send request', action: 'submit_lead' }],
    leadPatch: lead,
    qualification,
    nextExpectedField: 'question',
    leadReady: true,
    analytics: ['lead_started'],
  };
}

function handleConciergeMessage(input = {}) {
  const message = String(input.message || '').slice(0, 1200).trim();
  const action = String(input.action || '').trim();
  const state = input.state && typeof input.state === 'object' ? input.state : {};
  const expectedField = String(state.expectedField || '');
  const lang = detectLanguage(message || action);
  const mergedLead = mergeLead(state.lead || {}, message, expectedField);
  const intent = classifyIntent(message || action);

  if (action === 'intro') {
    return {
      reply: "Hi! I'm Natanael, your local guide in Lisbon. I'm often out showing guests around the city, so this assistant can answer most questions instantly. If you need personal help, you can leave me a message.",
      quickReplies: ['Find the right tour', 'Ask a question', 'Check availability'],
      leadPatch: mergedLead,
      qualification: 'INFORMATIONAL',
    };
  }

  if (action === 'find_tour' || /find the right tour/i.test(message)) {
    return { ...startTourFinder(lang), leadPatch: mergedLead, qualification: intent, analytics: ['tour_finder_started'] };
  }

  if (state.finder && state.finder.active) {
    const finderResponse = continueTourFinder({ message, state, lang });
    if (finderResponse) {
      return {
        ...finderResponse,
        leadPatch: { ...mergedLead, ...(finderResponse.leadPatch || {}) },
        qualification: intent,
      };
    }
  }

  if (expectedField && LEAD_EXPECTED_FIELDS.includes(expectedField)) {
    return continueLeadCapture(mergedLead, lang, intent === 'INFORMATIONAL' ? state.qualification || 'WARM' : intent);
  }

  if (action === 'check_availability' || /check availability|availability|available|book|reserve|booking/i.test(message)) {
    if (input.tourId && !mergedLead.tourId) mergedLead.tourId = input.tourId;
    const response = availabilityReply(mergedLead, lang);
    return {
      ...response,
      leadPatch: mergedLead,
      qualification: 'HOT',
      analytics: ['availability_requested', 'booking_intent', 'lead_started'],
    };
  }

  if (action === 'ask_question') {
    return {
      reply: lang === 'pt'
        ? 'Claro. Pode perguntar sobre tours, duracao, preco, pickup ou o que pretende ver em Lisboa.'
        : 'Of course. Ask me about tours, duration, price, pickup, or what you would like to see in Lisbon.',
      quickReplies: ['Compare tours', 'Pickup', 'Prices', 'Check availability'],
      leadPatch: mergedLead,
      qualification: 'INFORMATIONAL',
    };
  }

  const known = answerKnownQuestion(message, mergedLead, lang);
  if (known) {
    return { ...known, leadPatch: mergedLead, qualification: intent };
  }

  const recommended = chooseRecommendedTour({ message, lead: mergedLead, finder: state.finder || {} });
  if (recommended) {
    mergedLead.tourId = mergedLead.tourId || recommended.id;
    return {
      reply: buildTourRecommendation(recommended, mergedLead, lang),
      quickReplies: ['Check availability', 'View Tour', 'Ask a question'],
      ctas: buildTourCtas(recommended),
      leadPatch: mergedLead,
      recommendedTour: recommended.id,
      qualification: intent,
      analytics: ['tour_recommended'],
    };
  }

  if (parseEmail(message) && missingLeadFields(mergedLead).length <= 1) {
    if (needsPhone(mergedLead)) {
      return continueLeadCapture(mergedLead, lang, intent === 'INFORMATIONAL' ? state.qualification || 'WARM' : intent);
    }

    return {
      reply: 'Thanks. I have the key details for Natanael. Would you like me to send this request now?',
      quickReplies: ['Send request to Natanael', 'Add a question'],
      ctas: [{ label: 'Send request', action: 'submit_lead' }],
      leadPatch: mergedLead,
      qualification: intent,
      leadReady: true,
      analytics: ['lead_started'],
    };
  }

  return {
    reply: [
      "I can help you choose between Alfama, Belem, Chiado & Bairro Alto, Full City, and the full-day Van Tour.",
      "Tell me how much time you have, what you want to experience, your group size, or your travel date."
    ].join('\n\n'),
    quickReplies: ['Find the right tour', 'Check availability', 'Compare tours'],
    leadPatch: mergedLead,
    qualification: intent,
  };
}

module.exports = {
  capacityNote,
  chooseRecommendedTour,
  classifyIntent,
  detectTourId,
  findTourById,
  getTours,
  handleConciergeMessage,
  mergeLead,
  missingLeadFields,
  normalizeText,
};
