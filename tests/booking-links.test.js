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
  ['alfama', 'belem', 'chiado', 'fullcity', 'van'].forEach((tourId) => {
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
  assert.match(bookingHtml, /Private local experience/);
  assert.match(linksJs, /tour_page_price_block/);
  assert.match(linksJs, /Viator and Tripadvisor Experiences/);
});

test('checkout page includes tour photos and reassurance content', () => {
  const bookingHtml = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');

  assert.match(bookingHtml, /id="photo-track"/);
  assert.match(bookingHtml, /\/images\/miradouros-1\.jpg/);
  assert.match(bookingHtml, /\/images\/belem-1\.jpg/);
  assert.match(bookingHtml, /\/images\/van-sintra\.jpg/);
  assert.match(bookingHtml, /What you can expect/);
  assert.match(bookingHtml, /How this checkout works/);
  assert.match(bookingHtml, /booking_gallery_interaction/);
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
