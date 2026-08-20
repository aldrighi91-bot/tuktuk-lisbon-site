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
  assert.match(linksJs, /tour_page_price_block/);
  assert.match(linksJs, /Viator and Tripadvisor Experiences/);
});
