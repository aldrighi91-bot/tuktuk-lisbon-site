/* Tuk Tuk Lisbon — static site logic */
(function () {
  const WHATSAPP = '351967315921';

  const TOUR_IDS = ['miradouros', 'centro-historico', 'belem', 'personalizado'];
  const TOUR_IMAGES = {
    miradouros: [
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/cd84fdd5cfaefb01bbeb9a824c9f9e8b.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/c0725746179e5a516fd12d7da5b17076.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/8d282da2a037d70fff5e9f5ac1419b90.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/5030eb32b74eec6fa1c4b69c557a44f6.png',
    ],
    'centro-historico': [
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/c164fa721476d37479496331ff749cfb.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/7e2784cf6347b157a44c81e02e3b7160.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/62e401ad457e7d9ecf6862f1a5ad48d4.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/e2f5dda8d9e078d6a50b9274da99c356.png',
    ],
    belem: [
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/466e7315d70d24e566f9b79dd87cb563.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/d8ed04a5f9d59c45971db36946cfcd4b.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/47165b31e622d45274bebd6e86a1857c.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/9e8e4f7acab2af688793ee87c72da238.png',
    ],
    personalizado: [
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/3fc0b06acec76e63fd6c60d9bc74a40f.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/99fce9fbb9204ac30b5061b3b54ea93c.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/bacdcc18fbfd93b53eb510090b841d06.png',
      'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/8a55c18c578656805ed9266bda4edb9d.png',
    ],
  };
  const POPULAR_ID = 'miradouros';

  const STEP_ICONS = [
    '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    '<polyline points="20 6 9 17 4 12"/>',
  ];
  const ADV_ICONS = [
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    '<path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>',
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    '<polygon points="12 2 15 8.5 22 9.3 17 14 18.5 21 12 17.8 5.5 21 7 14 2 9.3 9 8.5 12 2"/>',
    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11z"/><circle cx="12" cy="13" r="4"/>',
  ];

  const GALLERY = [
    'https://horizons-cdn.hostinger.com/20ead15c-72b0-4e94-94e0-7900bd734ab0/278ad318d2332554d0ec70e729838c41.jpg',
    'https://images.unsplash.com/photo-1694595833397-c282bf7253b2?w=900&q=80',
    'https://images.unsplash.com/photo-1682346556160-2bdcf317ba84?w=900&q=80',
    'https://images.unsplash.com/photo-1612151768216-59f49cf481a0?w=900&q=80',
    'https://images.unsplash.com/photo-1667984812556-c2e8ad5627cc?w=900&q=80',
    'https://images.unsplash.com/photo-1565716130823-6959103dc3e3?w=900&q=80',
  ];

  /* ===== language ===== */
  const supported = ['pt', 'en', 'es'];
  function detectLang() {
    const saved = localStorage.getItem('language');
    if (supported.includes(saved)) return saved;
    return 'en';
  }
  let lang = detectLang();
  function get(path, fallback) {
    const parts = path.split('.');
    let v = window.I18N[lang];
    for (const p of parts) { v = v && v[p]; if (v == null) break; }
    if (v != null) return v;
    v = window.I18N.en;
    for (const p of parts) { v = v && v[p]; if (v == null) break; }
    return v != null ? v : (fallback || '');
  }

  /* ===== renderers ===== */
  const $ = (s) => document.querySelector(s);

  function svg(inner, cls = 'h-5 w-5') {
    return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  function tourCard(id) {
    const t = get('tours.items.' + id);
    const tn = get('tours');
    const popular = id === POPULAR_ID;
    const slides = TOUR_IMAGES[id].map((src, i) =>
      `<div class="relative aspect-square"><img src="${src}" loading="lazy" alt="${t.name} ${i+1}" class="w-full h-full object-cover"/></div>`
    ).join('');

    return `
    <article class="rounded-2xl overflow-hidden bg-white shadow-card lift border border-border/60 flex flex-col">
      <div class="relative">
        <div class="carousel" data-carousel>${slides}</div>
        ${popular ? `
          <div class="absolute top-4 left-4 bg-brand-600 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-md flex items-center gap-1.5 z-20">
            <svg class="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            ${tn.mostPopular}
          </div>` : ''}
        <div class="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-full px-4 py-1.5 z-20 text-brand-600 font-extrabold text-lg border-2 border-brand-600/15 shadow-md">${t.price}</div>
        <button class="carousel-arrow" style="left:1rem" aria-label="Prev" data-prev>${svg('<polyline points="15 18 9 12 15 6"/>')}</button>
        <button class="carousel-arrow" style="right:1rem" aria-label="Next" data-next>${svg('<polyline points="9 18 15 12 9 6"/>')}</button>
      </div>
      <div class="p-6 pb-4">
        <h3 class="text-2xl font-bold mb-2">${t.name}</h3>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2 text-base text-muted">
            ${svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 'h-4 w-4 text-brand-600')}
            ${t.duration}
          </div>
          <div class="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 px-2.5 py-1 rounded-md text-sm font-medium w-fit">
            ${svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 'h-4 w-4')}
            ${tn.capacity}
          </div>
        </div>
      </div>
      <div class="px-6 pb-6 flex-grow">
        <p class="text-ink/80 mb-5 leading-relaxed">${t.desc}</p>
        <span class="text-sm font-bold uppercase tracking-wider">${tn.highlights}</span>
        <ul class="mt-3 space-y-2">
          ${t.highlights.map(h => `
            <li class="flex items-start gap-2 text-sm text-ink/75">
              ${svg('<polyline points="20 6 9 17 4 12"/>', 'h-4 w-4 text-brand-600 flex-shrink-0 mt-0.5')}
              <span>${h}</span>
            </li>`).join('')}
        </ul>
      </div>
      <div class="mt-auto p-6 border-t border-border/60 space-y-3">
        <button onclick="openWa()" class="w-full h-12 rounded-md bg-brand-600 hover:bg-brand-700 text-white font-bold transition active:scale-[.98]">${tn.bookBtn}</button>
        <p class="text-xs text-muted text-center bg-surface py-2 rounded-md">${tn.paymentNote}</p>
      </div>
    </article>`;
  }

  function stepRow(s, i) {
    const n = String(i + 1).padStart(2, '0');
    return `
    <div class="flex gap-6 items-start bg-white p-6 rounded-2xl shadow-sm border border-border/50 reveal">
      <div class="text-5xl md:text-6xl font-bold text-brand-600/15 select-none leading-none">${n}</div>
      <div class="flex-grow pt-1">
        <div class="flex items-center gap-3 mb-2">
          <div class="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            ${svg(STEP_ICONS[i], 'h-5 w-5 md:h-6 md:w-6 text-brand-600')}
          </div>
          <h3 class="text-lg md:text-xl font-bold">${s.title}</h3>
        </div>
        <p class="text-muted leading-relaxed text-sm md:text-base">${s.desc}</p>
      </div>
    </div>`;
  }

  function advCard(a, i) {
    return `
    <article class="rounded-2xl bg-white border border-border lift p-6 reveal">
      <div class="h-12 w-12 rounded-lg bg-brand-600 flex items-center justify-center mb-4 shadow-md shadow-brand-600/20">
        ${svg(ADV_ICONS[i], 'h-6 w-6 text-white')}
      </div>
      <h3 class="text-xl font-bold mb-2">${a.title}</h3>
      <p class="text-ink/70 leading-relaxed">${a.desc}</p>
    </article>`;
  }

  function galTile(src, i) {
    return `<div class="relative aspect-square rounded-xl overflow-hidden group reveal">
      <img src="${src}" alt="Gallery ${i+1}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"/>
      <div class="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
    </div>`;
  }

  function faqItem(f) {
    return `<details class="bg-white rounded-xl border border-border/40 shadow-sm px-6 reveal">
      <summary class="flex items-center justify-between py-5 font-bold text-left">
        ${f.q}
        ${svg('<polyline points="6 9 12 15 18 9"/>', 'chev h-5 w-5 text-brand-600 transition-transform')}
      </summary>
      <p class="text-muted leading-relaxed pb-6 pt-1">${f.a}</p>
    </details>`;
  }

  /* ===== mount ===== */
  function renderAll() {
    document.documentElement.lang = lang;

    // Static [data-i18n] elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = get(el.dataset.i18n);
      if (typeof v === 'string') el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const v = get(el.dataset.i18nPlaceholder);
      if (typeof v === 'string') el.placeholder = v;
    });

    // Tour <option>s in the form
    document.querySelectorAll('select#f-tour option[data-tour-key]').forEach(opt => {
      const k = opt.dataset.tourKey;
      const name = get('tours.items.' + k + '.name');
      if (name) opt.textContent = name;
    });

    // Dynamic blocks
    $('#tours-grid').innerHTML = TOUR_IDS.map(tourCard).join('');
    $('#steps').innerHTML       = get('howItWorks.steps').map(stepRow).join('');
    $('#advantages').innerHTML  = get('advantages.items').map(advCard).join('');
    $('#gallery').innerHTML     = GALLERY.map(galTile).join('');
    $('#faq-list').innerHTML    = get('faq.items').map(faqItem).join('');

    // Carousel arrows + autoplay
    document.querySelectorAll('[data-carousel]').forEach(car => {
      const wrap = car.parentElement;
      const sw = () => car.clientWidth;
      wrap.querySelector('[data-prev]').addEventListener('click', () => car.scrollBy({ left: -sw(), behavior: 'smooth' }));
      wrap.querySelector('[data-next]').addEventListener('click', () => car.scrollBy({ left:  sw(), behavior: 'smooth' }));
      let timer = setInterval(autoplay, 3500);
      function autoplay() {
        if (document.hidden) return;
        const max = car.scrollWidth - car.clientWidth - 4;
        if (car.scrollLeft >= max) car.scrollTo({ left: 0, behavior: 'smooth' });
        else car.scrollBy({ left: sw(), behavior: 'smooth' });
      }
      wrap.addEventListener('mouseenter', () => clearInterval(timer));
      wrap.addEventListener('mouseleave', () => timer = setInterval(autoplay, 3500));
    });

    // Reveal-on-scroll
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));

    // Lang switcher state
    document.querySelectorAll('#lang-switcher .lang-btn').forEach(b => {
      b.setAttribute('aria-current', b.dataset.lang === lang ? 'true' : 'false');
    });
  }

  /* ===== language switcher ===== */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#lang-switcher .lang-btn');
    if (!b) return;
    const next = b.dataset.lang;
    if (next === lang || !supported.includes(next)) return;
    lang = next;
    localStorage.setItem('language', next);
    renderAll();
  });

  /* ===== WhatsApp ===== */
  window.openWa = function () {
    const msg = encodeURIComponent(get('contact.whatsappMsg'));
    window.open('https://wa.me/' + WHATSAPP + '?text=' + msg, '_blank');
  };

  document.getElementById('booking-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const f = (id) => document.getElementById(id).value.trim();
    const name = f('f-name'), phone = f('f-phone');
    if (!name || !phone) { alert('!'); return; }
    const date = f('f-date'), people = f('f-people'), tour = f('f-tour'), obs = f('f-obs');
    const tbd = get('contact.form.toBeDefined');
    const none = get('contact.form.none');
    const tourName = tour ? get('tours.items.' + tour + '.name') : tbd;
    const lines = [
      get('contact.whatsappMsg'),
      '',
      `${get('contact.form.name')}: ${name}`,
      `${get('contact.form.phone')}: ${phone}`,
      `${get('contact.form.date')}: ${date || tbd}`,
      `${get('contact.form.people')}: ${people || tbd}`,
      `${get('contact.form.tour')}: ${tourName}`,
      `${get('contact.form.obs')}: ${obs || none}`,
    ];
    window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(lines.join('\n')), '_blank');
  });

  /* ===== boot ===== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAll);
  } else {
    renderAll();
  }
})();
