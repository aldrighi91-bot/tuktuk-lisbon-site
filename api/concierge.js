const { handleConciergeMessage } = require('../lib/concierge/assistant');
const { checkRateLimit } = require('../lib/concierge/rate-limit');

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (!req.body) return {};
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const rate = checkRateLimit(req, { prefix: 'concierge', max: 45, windowMs: 60 * 1000 });
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  const body = readBody(req);
  const message = typeof body.message === 'string' ? body.message : '';
  if (message.length > 1200) {
    res.status(400).json({ error: 'Message is too long' });
    return;
  }

  try {
    const result = handleConciergeMessage(body);
    res.status(200).json(result);
  } catch (error) {
    console.error('concierge handler failed', error.message);
    res.status(200).json({
      reply: "I can't answer instantly right now. You can leave your date, group size and email, and Natanael will follow up.",
      quickReplies: ['Check availability', 'Ask a question'],
      error: 'fallback',
    });
  }
};
