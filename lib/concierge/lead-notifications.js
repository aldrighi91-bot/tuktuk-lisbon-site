const DEFAULT_CONTACT_EMAIL = 'contact@tuktuklisbon.tours';
const DEFAULT_FROM = `TukTuk Lisbon <${DEFAULT_CONTACT_EMAIL}>`;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function cleanString(value) {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return cleanString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatValue(value, fallback = '-') {
  const clean = cleanString(value);
  return clean || fallback;
}

function leadSummaryLines(payload) {
  return [
    ['Lead ID', payload.id],
    ['Name', payload.name],
    ['Email', payload.email],
    ['Phone / WhatsApp', payload.phone],
    ['Tour', payload.tourName || payload.tourId],
    ['Tour slug', payload.tourId],
    ['Desired date', payload.desiredDate],
    ['Preferred time', payload.preferredTime],
    ['Guests', payload.guests],
    ['Pickup area', payload.pickupArea],
    ['Question / message', payload.message],
    ['Qualification', payload.qualification],
    ['Source path', payload.sourcePath],
    ['Created at', payload.createdAt],
  ];
}

function renderLeadSummaryText(payload) {
  return leadSummaryLines(payload)
    .map(([label, value]) => `${label}: ${formatValue(value)}`)
    .join('\n');
}

function renderLeadSummaryHtml(payload) {
  const rows = leadSummaryLines(payload)
    .map(([label, value]) => {
      return `<tr><th align="left" style="padding:6px 12px 6px 0;color:#374151;vertical-align:top;">${escapeHtml(label)}</th><td style="padding:6px 0;color:#111827;">${escapeHtml(formatValue(value))}</td></tr>`;
    })
    .join('');

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;line-height:1.45;">${rows}</table>`;
}

function buildOwnerNotification(payload) {
  const tourName = payload.tourName || payload.tourId || 'Tour';
  const subject = `New TukTuk Lisbon lead - ${formatValue(tourName)} - ${formatValue(payload.desiredDate)}`;
  const text = [
    'New lead received from the TukTuk Lisbon site concierge.',
    '',
    renderLeadSummaryText(payload),
    '',
    'Reply directly to the customer using the email and phone above.',
  ].join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;">',
    '<p>New lead received from the TukTuk Lisbon site concierge.</p>',
    renderLeadSummaryHtml(payload),
    '<p>Reply directly to the customer using the email and phone above.</p>',
    '</div>',
  ].join('');

  return { subject, text, html };
}

function buildCustomerConfirmation(payload, contactEmail = DEFAULT_CONTACT_EMAIL) {
  const name = formatValue(payload.name, 'there');
  const tourName = formatValue(payload.tourName || payload.tourId, 'your selected tour');
  const subject = 'We received your TukTuk Lisbon request';
  const text = [
    `Hi ${name},`,
    '',
    'Thank you for contacting TukTuk Lisbon.',
    '',
    `We received your request for ${tourName} on ${formatValue(payload.desiredDate)} at ${formatValue(payload.preferredTime)} for ${formatValue(payload.guests)} guest(s).`,
    '',
    'This is not a booking confirmation yet. Availability is confirmed only after the booking is accepted or held in Bókun, and our team will reply as soon as possible.',
    '',
    `For urgent questions, you can reply to this email or contact us at ${contactEmail}.`,
    '',
    'TukTuk Lisbon',
  ].join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111827;">',
    `<p>Hi ${escapeHtml(name)},</p>`,
    '<p>Thank you for contacting TukTuk Lisbon.</p>',
    `<p>We received your request for <strong>${escapeHtml(tourName)}</strong> on <strong>${escapeHtml(formatValue(payload.desiredDate))}</strong> at <strong>${escapeHtml(formatValue(payload.preferredTime))}</strong> for <strong>${escapeHtml(formatValue(payload.guests))}</strong> guest(s).</p>`,
    '<p>This is not a booking confirmation yet. Availability is confirmed only after the booking is accepted or held in Bókun, and our team will reply as soon as possible.</p>',
    `<p>For urgent questions, you can reply to this email or contact us at <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>.</p>`,
    '<p>TukTuk Lisbon</p>',
    '</div>',
  ].join('');

  return { subject, text, html };
}

async function sendResendEmail({ from, to, replyTo, subject, text, html, tags, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const body = {
    from,
    to,
    subject,
    text,
    html,
  };
  if (replyTo) body.reply_to = replyTo;
  if (tags?.length) body.tags = tags;

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'User-Agent': 'tuktuk-lisbon-site/1.0',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`resend email failed with status ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const data = await response.json().catch(() => ({}));
  return { provider: 'resend', id: data.id || null };
}

async function sendLeadNotificationEmails(payload) {
  if (process.env.CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED === 'true') {
    return null;
  }

  const from = process.env.CONCIERGE_EMAIL_FROM || DEFAULT_FROM;
  const ownerTo = process.env.CONCIERGE_NOTIFICATION_TO || DEFAULT_CONTACT_EMAIL;
  const replyTo = process.env.CONCIERGE_REPLY_TO || DEFAULT_CONTACT_EMAIL;
  const customer = buildCustomerConfirmation(payload, replyTo);
  const owner = buildOwnerNotification(payload);

  const ownerResult = await sendResendEmail({
    from,
    to: ownerTo,
    replyTo: payload.email,
    subject: owner.subject,
    text: owner.text,
    html: owner.html,
    tags: [
      { name: 'type', value: 'lead_owner' },
      { name: 'source', value: 'site_concierge' },
    ],
    idempotencyKey: `tuktuk-lead-${payload.id}-owner`,
  });

  if (!ownerResult) return null;

  const customerResult = await sendResendEmail({
    from,
    to: payload.email,
    replyTo,
    subject: customer.subject,
    text: customer.text,
    html: customer.html,
    tags: [
      { name: 'type', value: 'lead_customer' },
      { name: 'source', value: 'site_concierge' },
    ],
    idempotencyKey: `tuktuk-lead-${payload.id}-customer`,
  });

  return {
    delivery: 'email',
    provider: 'resend',
    owner: ownerResult,
    customer: customerResult,
  };
}

module.exports = {
  buildCustomerConfirmation,
  buildOwnerNotification,
  sendLeadNotificationEmails,
};
