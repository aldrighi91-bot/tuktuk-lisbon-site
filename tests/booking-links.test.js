const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const booking = require('../booking-links.js');

test('maps home tour identifiers to booking tour identifiers', () => {
  assert.equal(booking.normalizeTourId('miradouros'), 'alfama');
  assert.equal(booking.normalizeTourId('centro-historico'), 'chiado');
  assert.equal(booking.normalizeTourId('personalizado'), 'fullcity');
});

test('has Bókun booking-page links for every tour', () => {
  ['alfama', 'express', 'belem', 'chiado', 'fullcity', 'van'].forEach((tourId) => {
    const link = booking.getBookingLink(tourId);
    assert.equal(booking.hasOnlineBooking(tourId), true);
    assert.equal(link.url, `/booking.html?tour=${tourId}`);
    assert.equal(link.provider, 'Bókun');
  });
});

test('embeds the Bókun calendar widget inline', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');

  assert.match(html, /\/experience-calendar\/' \+ experienceId/);
  assert.doesNotMatch(html, /partialView=1/);
});

test('shows Tripadvisor-powered trust messaging for online booking', () => {
  const bookingHtml = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');
  const linksJs = fs.readFileSync(path.join(__dirname, '..', 'booking-links.js'), 'utf8');

  assert.match(bookingHtml, /Tripadvisor-powered technology/);
  assert.match(bookingHtml, /Bókun is a Tripadvisor company/);
  assert.match(bookingHtml, /Balance paid in person/);
  assert.match(bookingHtml, /tripadvisor-badge/);
  assert.match(bookingHtml, /tripadvisor-wordmark/);
  assert.match(bookingHtml, /Listed product · Bókun checkout/);
  assert.match(bookingHtml, /Pay 20% online/);
  assert.match(bookingHtml, /remaining 80% is paid in person/i);
  assert.equal((bookingHtml.match(/class="rating-bubble"/g) || []).length, 5);
  assert.match(linksJs, /tour_page_price_block/);
  assert.match(linksJs, /20% deposit online/);
});

test('checkout page includes tour photos and reassurance content', () => {
  const bookingHtml = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');

  assert.match(bookingHtml, /id="photo-track"/);
  assert.match(bookingHtml, /\/images\/miradouros-1\.jpg/);
  assert.match(bookingHtml, /\/images\/express-senhora-do-monte\.png/);
  assert.match(bookingHtml, /\/images\/belem-1\.jpg/);
  assert.match(bookingHtml, /\/images\/van-sintra\.jpg/);
  assert.match(bookingHtml, /What you can expect/);
  assert.match(bookingHtml, /How this checkout works/);
  assert.match(bookingHtml, /Pay only the 20% deposit/);
  assert.match(bookingHtml, /booking_gallery_interaction/);
});

test('tour pages and structured data use the current deposit policy', () => {
  const files = [
    'index.html',
    'booking.html',
    'data/tours.json',
    'tours/alfama.html',
    'tours/express.html',
    'tours/belem.html',
    'tours/chiado.html',
    'tours/fullcity.html',
    'tours/van.html',
  ];

  files.forEach((file) => {
    const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(content, /no deposit/i, `${file} should not mention no deposit`);
  });

  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/tours.json'), 'utf8'));
  assert.match(data.policies.payment, /20% deposit/);
  data.tours.forEach((tour) => {
    assert(tour.included.includes('20% online deposit; remaining balance paid in person'));
  });
});

test('homepage loads versioned booking assets for mobile cache busting', () => {
  const homeHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const linksJs = fs.readFileSync(path.join(__dirname, '..', 'booking-links.js'), 'utf8');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

  assert.match(homeHtml, /\/booking-links\.js\?v=20260820-cachefix/);
  assert.match(homeHtml, /\/app\.js\?v=20260820-cachefix/);
  assert.match(homeHtml, /home_inline_fallback/);
  assert.match(homeHtml, /ensureHomepageBookingButtons/);
  assert.match(linksJs, /observeBookingButtons/);
  assert.deepEqual(vercelJson.headers[0], {
    source: '/(.*)\\.js',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
    ],
  });
});
