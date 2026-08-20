/* Central online booking link map for Tuk Tuk Lisbon. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TukTukBooking = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const HOME_TOUR_TO_BOOKING_TOUR = {
    miradouros: 'alfama',
    'centro-historico': 'chiado',
    belem: 'belem',
    personalizado: 'fullcity',
    van_home: 'van',
  };

  const BOOKING_LINKS = {
    alfama: {
      provider: 'Bókun',
      url: '/booking.html?tour=alfama',
      label: 'Book online',
    },
    belem: {
      provider: 'Bókun',
      url: '/booking.html?tour=belem',
      label: 'Book online',
    },
    chiado: {
      provider: 'Bókun',
      url: '/booking.html?tour=chiado',
      label: 'Book online',
    },
    fullcity: {
      provider: 'Bókun',
      url: '/booking.html?tour=fullcity',
      label: 'Book online',
    },
    van: {
      provider: 'Bókun',
      url: '/booking.html?tour=van',
      label: 'Book online',
    },
  };

  function normalizeTourId(tourId) {
    const key = String(tourId || '').trim();
    return HOME_TOUR_TO_BOOKING_TOUR[key] || key;
  }

  function getBookingLink(tourId) {
    return BOOKING_LINKS[normalizeTourId(tourId)] || null;
  }

  function hasOnlineBooking(tourId) {
    const link = getBookingLink(tourId);
    return Boolean(link && link.url);
  }

  function track(eventName, params) {
    if (!root) return;
    const payload = { event: eventName, ...(params || {}) };
    root.dataLayer = root.dataLayer || [];
    root.dataLayer.push(payload);
    if (typeof root.gtag === 'function') {
      root.gtag('event', eventName, params || {});
    }
  }

  function trackOnlineBooking(tourId, source, link) {
    const normalizedTourId = normalizeTourId(tourId);
    const payload = {
      event_category: 'booking',
      event_label: normalizedTourId,
      tour_id: normalizedTourId,
      booking_provider: (link && link.provider) || '',
      booking_source: source || '',
      outbound_url: (link && link.url) || '',
    };
    track('booking_intent', payload);
    track('online_booking_click', payload);
  }

  function openOnlineBooking(tourId, source) {
    const normalizedTourId = normalizeTourId(tourId);
    const link = getBookingLink(normalizedTourId);
    trackOnlineBooking(normalizedTourId, source, link);
    if (!link || !link.url || !root || typeof root.open !== 'function') return false;
    root.open(link.url, '_blank', 'noopener,noreferrer');
    return true;
  }

  function hydrateButtons(scope) {
    const doc = scope || (root && root.document);
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    doc.querySelectorAll('[data-booking-tour]').forEach((button) => {
      const tourId = button.getAttribute('data-booking-tour');
      const link = getBookingLink(tourId);
      const available = Boolean(link && link.url);
      const label = available
        ? button.getAttribute('data-booking-label') || (link && link.label) || 'Book online'
        : button.getAttribute('data-booking-pending-label') || (link && link.label) || 'Online booking soon';

      button.classList.toggle('is-booking-unavailable', !available);
      if ('disabled' in button) button.disabled = !available;
      button.setAttribute('aria-disabled', available ? 'false' : 'true');
      button.setAttribute('title', available ? `Book online via ${link.provider}` : 'Online checkout for this tour is not connected yet');

      const labelTarget = button.querySelector('[data-booking-text]');
      if (labelTarget) labelTarget.textContent = label;
      else button.textContent = label;
    });
  }

  if (root && root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', () => hydrateButtons(root.document));
    } else {
      hydrateButtons(root.document);
    }
  }

  return {
    getBookingLink,
    hasOnlineBooking,
    hydrateButtons,
    normalizeTourId,
    openOnlineBooking,
    trackOnlineBooking,
  };
});
