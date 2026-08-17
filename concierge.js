(function () {
  const STORAGE_KEY = 'tlc_state_v1';
  const WHATSAPP = '351967315921';
  const CONTACT_EMAIL = 'contact@tuktuklisbon.tours';
  const ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    minimize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  };

  const initialState = {
    messages: [],
    lead: {},
    finder: {},
    expectedField: '',
    started: false,
    leadStartedTracked: false,
    qualification: 'INFORMATIONAL',
    lastRecommendedTour: '',
    quickReplies: [],
    ctas: [],
    panelOpen: false,
  };

  let state = loadState();
  let root;
  let messagesEl;
  let quickEl;
  let ctasEl;
  let inputEl;

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return normalizeState(parsed);
    } catch {
      return normalizeState();
    }
  }

  function normalizeState(parsed = {}) {
    return {
      ...initialState,
      ...parsed,
      lead: parsed.lead && typeof parsed.lead === 'object' ? parsed.lead : {},
      finder: parsed.finder && typeof parsed.finder === 'object' ? parsed.finder : {},
      quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies : [],
      ctas: Array.isArray(parsed.ctas) ? parsed.ctas : [],
      panelOpen: parsed.panelOpen === true,
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      messages: state.messages.slice(-24),
      lead: state.lead,
      finder: state.finder,
      expectedField: state.expectedField,
      started: state.started,
      leadStartedTracked: state.leadStartedTracked,
      qualification: state.qualification,
      lastRecommendedTour: state.lastRecommendedTour,
      quickReplies: state.quickReplies || [],
      ctas: state.ctas || [],
      panelOpen: state.panelOpen === true,
    }));
  }

  function track(eventName, params) {
    const payload = { event: eventName, ...(params || {}) };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, {
        event_category: 'concierge',
        ...(params || {}),
      });
    }
  }

  function createRoot() {
    root = document.createElement('div');
    root.className = 'tlc-root';
    root.dataset.open = state.panelOpen ? 'true' : 'false';
    root.dataset.teaser = state.panelOpen || sessionStorage.getItem('tlc_teaser_closed') ? 'hidden' : 'waiting';
    root.innerHTML = `
      <div class="tlc-teaser" role="dialog" aria-label="Tour assistant prompt">
        <p><strong>Hi! Planning your visit to Lisbon?</strong><br>I can help you choose the perfect private tour in less than a minute.</p>
        <div class="tlc-quick">
          <button class="tlc-chip" data-action="find_tour">Find the right tour</button>
          <button class="tlc-chip" data-action="ask_question">Ask a question</button>
          <button class="tlc-chip" data-action="check_availability">Check availability</button>
        </div>
      </div>
      <section class="tlc-panel" aria-label="Tuk Tuk Lisbon tour assistant">
        <header class="tlc-header">
          <div>
            <div class="tlc-title">Tuk Tuk Lisbon Assistant</div>
            <div class="tlc-subtitle">Natanael's local tour concierge</div>
          </div>
          <div class="tlc-header-actions">
            <button class="tlc-icon-btn" data-minimize aria-label="Minimize chat">${ICONS.minimize}</button>
            <button class="tlc-icon-btn" data-close aria-label="Close chat">${ICONS.close}</button>
          </div>
        </header>
        <div class="tlc-messages" aria-live="polite"></div>
        <div class="tlc-quick"></div>
        <div class="tlc-ctas"></div>
        <form class="tlc-form">
          <textarea class="tlc-input" rows="1" maxlength="1200" placeholder="Ask about tours, dates, group size..."></textarea>
          <button class="tlc-send" type="submit" aria-label="Send">${ICONS.send}</button>
        </form>
      </section>
      <button class="tlc-launcher" type="button" aria-label="Open tour assistant">${ICONS.chat}<span>Tour help</span></button>
    `;
    document.body.appendChild(root);
    messagesEl = root.querySelector('.tlc-messages');
    quickEl = root.querySelector('.tlc-panel .tlc-quick');
    ctasEl = root.querySelector('.tlc-ctas');
    inputEl = root.querySelector('.tlc-input');
  }

  function bindEvents() {
    root.querySelector('.tlc-launcher').addEventListener('click', openChat);
    root.querySelector('[data-minimize]').addEventListener('click', closeChat);
    root.querySelector('[data-close]').addEventListener('click', () => {
      closeChat();
      root.dataset.teaser = 'hidden';
      sessionStorage.setItem('tlc_teaser_closed', '1');
    });
    root.addEventListener('click', (event) => {
      if (root.dataset.busy === 'true') return;
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        openChat();
        handleAction(actionButton.dataset.action, actionButton.dataset.tourId || '');
      }
      const ctaButton = event.target.closest('[data-cta]');
      if (ctaButton) handleCta(ctaButton.dataset.cta, ctaButton.dataset.href || '', ctaButton.dataset.tourId || '');
    });
    root.querySelector('.tlc-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const message = inputEl.value.trim();
      if (!message) return;
      inputEl.value = '';
      sendMessage(message);
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + 'px';
    });
  }

  function openChat() {
    const wasOpen = root.dataset.open === 'true';
    root.dataset.open = 'true';
    state.panelOpen = true;
    root.dataset.teaser = 'hidden';
    sessionStorage.setItem('tlc_teaser_closed', '1');
    saveState();
    inputEl.focus({ preventScroll: true });
    if (!wasOpen) track('concierge_open');
    if (!state.messages.length) {
      callConcierge('', 'intro');
    } else {
      render();
    }
  }

  function closeChat() {
    root.dataset.open = 'false';
    state.panelOpen = false;
    saveState();
  }

  function showTeaserLater() {
    if (sessionStorage.getItem('tlc_teaser_closed')) return;
    window.setTimeout(() => {
      if (root && root.dataset.open !== 'true') root.dataset.teaser = 'visible';
    }, 9500);
  }

  function addMessage(role, text) {
    state.messages.push({ role, text, ts: Date.now() });
    state.messages = state.messages.slice(-30);
    saveState();
    renderMessages();
  }

  function addAssistantOnce(text) {
    const last = state.messages[state.messages.length - 1];
    if (last && last.role === 'assistant' && last.text === text) {
      renderMessages();
      return;
    }
    addMessage('assistant', text);
  }

  function renderMessages() {
    messagesEl.innerHTML = state.messages.map((message) => {
      const div = document.createElement('div');
      div.className = 'tlc-message';
      div.dataset.role = message.role;
      div.textContent = message.text;
      return div.outerHTML;
    }).join('');
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderQuickReplies(items) {
    const quickReplies = items || state.quickReplies || [];
    quickEl.innerHTML = quickReplies.map((label) => {
      const action = labelToAction(label);
      return `<button class="tlc-chip" data-action="${action}">${escapeHtml(label)}</button>`;
    }).join('');
  }

  function renderCtas(items) {
    const ctas = items || [];
    ctasEl.innerHTML = ctas.map((cta, index) => {
      const kind = index === 0 || cta.action === 'submit_lead' ? 'primary' : 'secondary';
      return `<button class="tlc-cta" data-kind="${kind}" data-cta="${escapeHtml(cta.action)}" data-href="${escapeHtml(cta.href || '')}" data-tour-id="${escapeHtml(cta.tourId || '')}">${escapeHtml(cta.label)}</button>`;
    }).join('');
  }

  function setActionOptions(quickReplies, ctas) {
    state.quickReplies = quickReplies || [];
    state.ctas = ctas || [];
    saveState();
    renderQuickReplies(state.quickReplies);
    renderCtas(state.ctas);
  }

  function render() {
    renderMessages();
    renderQuickReplies(state.quickReplies || []);
    renderCtas(state.ctas || []);
  }

  function labelToAction(label) {
    const normalized = label.toLowerCase();
    if (normalized.includes('find')) return 'find_tour';
    if (normalized.includes('availability') || normalized.includes('book') || normalized.includes('send request')) return normalized.includes('send request') ? 'submit_lead' : 'check_availability';
    if (normalized.includes('view tour')) return 'view_tour';
    if (normalized.includes('whatsapp')) return 'whatsapp';
    if (normalized.includes('question')) return 'ask_question';
    return 'message:' + label;
  }

  function handleAction(action, tourId) {
    if (action.indexOf('message:') === 0) {
      sendMessage(action.slice(8));
      return;
    }
    if (action === 'submit_lead') {
      submitLead();
      return;
    }
    if (action === 'view_tour') {
      const tour = state.lastRecommendedTour || state.lead.tourId;
      if (tour) openInNewTab(`/tours/${tour}`);
      return;
    }
    if (action === 'whatsapp') {
      openWhatsApp(tourId || state.lead.tourId || '');
      return;
    }
    callConcierge('', action, tourId);
  }

  function handleCta(action, href, tourId) {
    if (action === 'link' && href) {
      if (isTourLink(href)) {
        openInNewTab(href);
        return;
      }
      window.location.href = href;
      return;
    }
    if (action === 'check_availability') {
      callConcierge('', 'check_availability', tourId);
      return;
    }
    if (action === 'whatsapp') {
      openWhatsApp(tourId);
      return;
    }
    if (action === 'submit_lead') {
      submitLead();
    }
  }

  function sendMessage(message) {
    addMessage('user', message);
    callConcierge(message, '');
  }

  function isTourLink(href) {
    return /^\/tours\/[a-z0-9-]+\/?$/i.test(href);
  }

  function openInNewTab(href) {
    saveState();
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function callConcierge(message, action, tourId) {
    if (!state.started && action !== 'intro') {
      state.started = true;
      track('concierge_started');
    }

    setBusy(true);
    try {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          action,
          tourId,
          state: {
            lead: state.lead,
            finder: state.finder,
            expectedField: state.expectedField,
          },
        }),
      });
      const data = await response.json();
      applyConciergeResponse(data);
    } catch {
      addMessage('assistant', "I can't answer instantly right now. You can still email Natanael or use WhatsApp if it is urgent.");
      renderCtas([
        { label: 'Email Natanael', action: 'link', href: buildMailto() },
        { label: 'WhatsApp', action: 'whatsapp' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function applyConciergeResponse(data) {
    if (data.leadPatch) state.lead = { ...state.lead, ...data.leadPatch };
    if (data.finderPatch) state.finder = { ...state.finder, ...data.finderPatch };
    if (data.nextExpectedField !== undefined) state.expectedField = data.nextExpectedField || '';
    if (data.qualification) state.qualification = data.qualification;
    if (data.recommendedTour) state.lastRecommendedTour = data.recommendedTour;
    state.quickReplies = data.quickReplies || [];
    state.ctas = data.ctas || [];
    saveState();

    addMessage('assistant', data.reply || 'How can I help with your Lisbon tour?');
    renderQuickReplies(state.quickReplies);
    renderCtas(state.ctas);

    if (Array.isArray(data.analytics)) {
      data.analytics.forEach((eventName) => {
        const params = {
          tour_id: data.recommendedTour || state.lead.tourId || '',
          qualification: state.qualification,
        };
        if (eventName === 'lead_started') {
          trackLeadStarted(params);
          return;
        }
        track(eventName, params);
      });
    }
    if (data.recommendedTour && !(Array.isArray(data.analytics) && data.analytics.includes('tour_recommended'))) {
      track('tour_recommended', {
        tour_id: data.recommendedTour,
        qualification: state.qualification,
      });
    }
  }

  async function submitLead() {
    trackLeadStarted({ qualification: state.qualification, tour_id: state.lead.tourId || '' });
    setBusy(true);
    try {
      const response = await fetch('/api/concierge-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: state.lead,
          qualification: state.qualification,
          sourcePath: window.location.pathname,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) {
        const missing = Array.isArray(data.fields) && data.fields.length ? formatMissingFields(data.fields) : '';
        addAssistantOnce(missing
          ? `I still need: ${missing}. Send that here and I can prepare the request.`
          : `The request is prepared, but automatic delivery is not connected on this preview yet. You can email Natanael directly at ${CONTACT_EMAIL}.`);
        setActionOptions(['Add a question'], [{ label: 'Email Natanael', action: 'link', href: buildMailto() }]);
        return;
      }

      track('lead_submitted', {
        qualification: state.qualification,
        tour_id: state.lead.tourId || '',
        lead_id: data.leadId,
      });
      addMessage('assistant', 'Thanks. Your request was sent to Natanael. He will reply personally to confirm availability and next steps.');
      setActionOptions(['Ask a question', 'WhatsApp'], [{ label: 'WhatsApp as backup', action: 'whatsapp', tourId: state.lead.tourId || '' }]);
    } catch {
      addAssistantOnce(`I could not submit the request right now. You can email Natanael directly at ${CONTACT_EMAIL}.`);
      setActionOptions(['Add a question'], [{ label: 'Email Natanael', action: 'link', href: buildMailto() }]);
    } finally {
      setBusy(false);
    }
  }

  function openWhatsApp(tourId) {
    track('whatsapp_from_concierge', {
      tour_id: tourId || state.lead.tourId || '',
      qualification: state.qualification,
    });
    const message = buildWhatsAppMessage(tourId);
    const anchor = document.createElement('a');
    anchor.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(message)}`;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.dataset.whatsappLabel = 'concierge';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function buildWhatsAppMessage(tourId) {
    const lead = state.lead || {};
    const tour = tourId || lead.tourId || 'not sure yet';
    return [
      "Hello! I'm planning a Lisbon tour and used the site assistant.",
      `Tour: ${tour}`,
      lead.desiredDate ? `Date: ${lead.desiredDate}` : '',
      lead.preferredTime ? `Time: ${lead.preferredTime}` : '',
      lead.guests ? `Guests: ${lead.guests}` : '',
      lead.pickupArea ? `Pickup: ${lead.pickupArea}` : '',
      lead.name ? `Name: ${lead.name}` : '',
      lead.email ? `Email: ${lead.email}` : '',
      lead.message ? `Message: ${lead.message}` : '',
      'Could you check availability for me?'
    ].filter(Boolean).join('\n');
  }

  function buildMailto() {
    const subject = encodeURIComponent('Lisbon tour availability request');
    const body = encodeURIComponent(buildWhatsAppMessage(state.lead.tourId || ''));
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function setBusy(isBusy) {
    root.dataset.busy = isBusy ? 'true' : 'false';
    root.querySelector('.tlc-send').disabled = isBusy;
  }

  function trackLeadStarted(params) {
    if (state.leadStartedTracked) return;
    state.leadStartedTracked = true;
    saveState();
    track('lead_started', params);
  }

  function formatMissingFields(fields) {
    const labels = {
      desiredDate: 'desired date',
      preferredTime: 'preferred time',
      pickupArea: 'pickup area',
      tourId: 'tour of interest',
      guests: 'number of guests',
    };
    return fields.map((field) => labels[field] || field).join(', ');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncStateFromStorage(event) {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    if (!root) return;
    root.dataset.open = state.panelOpen ? 'true' : 'false';
    root.dataset.teaser = state.panelOpen ? 'hidden' : root.dataset.teaser;
    render();
  }

  function boot() {
    createRoot();
    bindEvents();
    render();
    window.addEventListener('storage', syncStateFromStorage);
    if (state.panelOpen && !state.messages.length) callConcierge('', 'intro');
    showTeaserLater();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
