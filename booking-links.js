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

  function injectTourPageStyles(doc) {
    if (!doc || doc.getElementById('tuktuk-booking-inline-styles')) return;
    const style = doc.createElement('style');
    style.id = 'tuktuk-booking-inline-styles';
    style.textContent = `
      .cta-inline { padding: 14px 18px 0; display: grid; gap: 9px; }
      .cta-copy {
        margin: -1px 2px 2px;
        color: var(--muted, #657085);
        font-size: 11.5px;
        line-height: 1.45;
        text-align: center;
      }
      .trust-strip {
        margin: 10px 18px 0;
        display: grid;
        gap: 8px;
      }
      .trust-item {
        padding: 11px 12px;
        border: 1px solid var(--border, #dce3ee);
        border-radius: 10px;
        background: #fff;
      }
      .trust-item strong {
        display: block;
        color: var(--ink, #182033);
        font-size: 12.5px;
        font-weight: 800;
      }
      .trust-item span {
        display: block;
        margin-top: 2px;
        color: var(--muted, #657085);
        font-size: 11.5px;
        line-height: 1.4;
      }
    `;
    doc.head.appendChild(style);
  }

  function createBookingIcon(doc) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>';
    return svg;
  }

  function hydrateTourPageInlineBooking(scope) {
    const doc = scope || (root && root.document);
    if (!doc || !doc.body || doc.querySelector('[data-tour-inline-booking], .cta-inline')) return;

    const stickyOnline = doc.querySelector('.cta-sticky [data-booking-tour]');
    const info = doc.querySelector('.info');
    if (!stickyOnline || !info) return;

    const tourId = stickyOnline.getAttribute('data-booking-tour');
    const link = getBookingLink(tourId);
    if (!link || !link.url) return;

    injectTourPageStyles(doc);

    const wrap = doc.createElement('div');
    wrap.className = 'cta-inline';
    wrap.setAttribute('data-tour-inline-booking', '');

    const online = doc.createElement('button');
    online.className = 'cta cta-online';
    online.type = 'button';
    online.setAttribute('data-booking-tour', tourId);
    online.setAttribute('data-booking-label', stickyOnline.getAttribute('data-booking-label') || 'Book online');
    online.setAttribute('data-booking-pending-label', stickyOnline.getAttribute('data-booking-pending-label') || 'Online booking soon');
    online.appendChild(createBookingIcon(doc));
    const label = doc.createElement('span');
    label.setAttribute('data-booking-text', '');
    label.textContent = 'Book online';
    online.appendChild(label);
    online.addEventListener('click', () => openOnlineBooking(tourId, 'tour_page_price_block'));

    const copy = doc.createElement('p');
    copy.className = 'cta-copy';
    copy.textContent = 'Secure checkout powered by Bókun, a Tripadvisor company. Bókun connects operators with Viator and Tripadvisor Experiences.';

    wrap.appendChild(online);
    wrap.appendChild(copy);

    const stickyWhatsapp = doc.querySelector('.cta-sticky .cta:not(.cta-online)');
    if (stickyWhatsapp) {
      const whatsapp = stickyWhatsapp.cloneNode(true);
      whatsapp.type = 'button';
      wrap.appendChild(whatsapp);
    }

    const trust = doc.createElement('div');
    trust.className = 'trust-strip';
    trust.innerHTML = [
      '<div class="trust-item"><strong>Tripadvisor-powered booking technology</strong><span>The online checkout runs on Bókun, part of Tripadvisor and connected with Viator distribution tools.</span></div>',
      '<div class="trust-item"><strong>Local confirmation from Natanael</strong><span>For on-request times, Natanael personally confirms availability and pickup details.</span></div>',
    ].join('');

    info.insertAdjacentElement('afterend', trust);
    info.insertAdjacentElement('afterend', wrap);
    hydrateButtons(doc);
  }

  function observeBookingButtons(doc) {
    if (!doc || !doc.body || doc.body.dataset.bookingObserver === '1') return;
    const Observer = root && root.MutationObserver;
    if (typeof Observer !== 'function') return;
    doc.body.dataset.bookingObserver = '1';

    let pending = false;
    const run = () => {
      pending = false;
      hydrateButtons(doc);
      hydrateTourPageInlineBooking(doc);
    };

    const observer = new Observer(() => {
      if (pending) return;
      pending = true;
      if (root && typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(run);
      else setTimeout(run, 0);
    });

    observer.observe(doc.body, {
      childList: true,
      subtree: true,
    });
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
      root.document.addEventListener('DOMContentLoaded', () => {
        hydrateButtons(root.document);
        hydrateTourPageInlineBooking(root.document);
        observeBookingButtons(root.document);
      });
    } else {
      hydrateButtons(root.document);
      hydrateTourPageInlineBooking(root.document);
      observeBookingButtons(root.document);
    }
  }

  return {
    getBookingLink,
    hydrateTourPageInlineBooking,
    observeBookingButtons,
    hasOnlineBooking,
    hydrateButtons,
    normalizeTourId,
    openOnlineBooking,
    trackOnlineBooking,
  };
});
