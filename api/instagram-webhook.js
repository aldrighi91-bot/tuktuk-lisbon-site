const crypto = require('crypto');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const SEND_ENDPOINT_ID = process.env.META_SEND_ENDPOINT_ID || 'me';
const APP_SECRET = process.env.META_APP_SECRET;
const REQUIRE_SIGNATURE = process.env.META_REQUIRE_SIGNATURE === 'true';

const TOURS = [
  'Viewpoints + Alfama: 1.5h, EUR 130 per private group, up to 6 people.',
  'Historical Center: 2h, EUR 190 per private group, up to 6 people.',
  'Belem: 2h, EUR 190 per private group, up to 6 people.',
  'Full City Tour: 4h, EUR 360 per private group, up to 6 people.',
  'Private Van Tour: 8h, EUR 600 per group, up to 8 people.',
];

function normalize(text = '') {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buildReply(text = '') {
  const msg = normalize(text);
  const wantsPrice = /price|cost|how much|preco|valor|quanto|precio|cuanto|tour|tours|passeio/.test(msg);
  const wantsBooking = /book|booking|reserve|reservation|available|availability|reservar|reserva|disponivel|disponibilidade|horario|hora/.test(msg);
  const saysHello = /hello|hi|hey|ola|buenas|hola/.test(msg);

  if (wantsPrice) {
    return [
      'Hi, I am Lisa from Tuk Tuk Lisbon. Here are our private tour options:',
      '',
      ...TOURS,
      '',
      'To check availability, please send the date, preferred time, number of people, and pickup area.',
      'You can also book faster on WhatsApp: https://wa.me/351967315921',
    ].join('\n');
  }

  if (wantsBooking) {
    return [
      'Hi, I am Lisa from Tuk Tuk Lisbon. I can help check availability.',
      '',
      'Please send:',
      '1. Tour or area you want to visit',
      '2. Date and preferred time',
      '3. Number of people',
      '4. Pickup area or hotel',
      '',
      'For faster confirmation, WhatsApp is best: https://wa.me/351967315921',
    ].join('\n');
  }

  if (saysHello) {
    return [
      'Hi, I am Lisa from Tuk Tuk Lisbon. We offer private tuk tuk tours in Lisbon with local guides.',
      '',
      'Would you like prices, availability, or help choosing the best tour?',
    ].join('\n');
  }

  return [
    'Hi, I am Lisa from Tuk Tuk Lisbon. Thanks for your message.',
    '',
    'I can help with tour prices, availability, pickup, duration, and booking by WhatsApp.',
    'For faster confirmation, message us here: https://wa.me/351967315921',
  ].join('\n');
}

async function sendInstagramMessage(recipientId, text) {
  if (!PAGE_ACCESS_TOKEN) {
    console.warn('META_PAGE_ACCESS_TOKEN is not configured');
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${SEND_ENDPOINT_ID}/messages?access_token=${encodeURIComponent(PAGE_ACCESS_TOKEN)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('Instagram send failed', response.status, body);
    return;
  }

  console.warn('Instagram send succeeded', response.status);
}

async function readRawBody(req) {
  if (req.rawBody) return req.rawBody;
  if (Buffer.isBuffer(req.body) || typeof req.body === 'string') return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length) return Buffer.concat(chunks);

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }

  return '';
}

function parseJsonBody(req, rawBody) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (!rawBody) return {};

  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Instagram webhook JSON parse failed', error.message);
    return {};
  }
}

function collectMessages(body) {
  const messages = [];
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const senderId = event.sender && event.sender.id;
      const text = event.message && event.message.text;
      const isEcho = event.message && event.message.is_echo;
      if (senderId && text && !isEcho) messages.push({ senderId, text });
    }

    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;

      const value = change.value || {};
      const senderId = value.sender && value.sender.id;
      const text = value.message && value.message.text;
      const isEcho = value.message && value.message.is_echo;

      if (senderId && text && !isEcho) messages.push({ senderId, text });
    }
  }
  return messages;
}

function summarizeWebhookBody(body) {
  const entries = body.entry || [];
  const fields = entries.flatMap((entry) => (entry.changes || []).map((change) => change.field));
  const messagingEvents = entries.reduce((total, entry) => total + (entry.messaging || []).length, 0);

  return {
    object: body.object || null,
    entries: entries.length,
    fields,
    messagingEvents,
  };
}

function verifyMetaSignature(req, rawBody) {
  if (!APP_SECRET) return true;

  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !signature.startsWith('sha256=')) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).send('Forbidden');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).send('Method Not Allowed');
    return;
  }

  const rawBody = await readRawBody(req);

  const hasValidSignature = verifyMetaSignature(req, rawBody);
  if (REQUIRE_SIGNATURE && !hasValidSignature) {
    console.error('Instagram webhook signature validation failed');
    res.status(403).send('Invalid signature');
    return;
  }

  const body = parseJsonBody(req, rawBody);
  const messages = collectMessages(body);
  const summary = summarizeWebhookBody(body);
  console.warn(
    `IG_WEBHOOK messages=${messages.length} fields=${summary.fields.join(',') || 'none'} messaging=${summary.messagingEvents} object=${summary.object} entries=${summary.entries} sig=${APP_SECRET ? (hasValidSignature ? 'valid' : 'skipped') : 'none'}`
  );

  await Promise.all(
    messages.map(({ senderId, text }) => sendInstagramMessage(senderId, buildReply(text)))
  );

  res.status(200).json({ ok: true, received: messages.length });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
