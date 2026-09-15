/* ---------------------------------------------------------------------------
 * site.js — language switching, navigation, the lead form and the marketplace
 * comparison links.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  /* ---------------------------------------------------------------------
   * Language
   *
   * Every translatable string lives in data-pt / data-es on the element that
   * shows it. Placeholders use data-pt-ph / data-es-ph, ARIA labels use
   * data-pt-label / data-es-label, and the handful of strings that carry
   * markup are marked data-i18n-html.
   * ------------------------------------------------------------------- */

  var LANGS = ['pt', 'es'];
  var STORAGE_KEY = 'ar24:lang';

  function setLang(lang, options) {
    if (LANGS.indexOf(lang) === -1) lang = 'pt';
    var opts = options || {};

    document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'es-ES';

    $$('[data-' + lang + ']').forEach(function (el) {
      var value = el.getAttribute('data-' + lang);
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = value;
      else el.textContent = value;
    });
    $$('[data-' + lang + '-ph]').forEach(function (el) {
      el.placeholder = el.getAttribute('data-' + lang + '-ph');
    });
    $$('[data-' + lang + '-label]').forEach(function (el) {
      el.setAttribute('aria-label', el.getAttribute('data-' + lang + '-label'));
    });

    // Each page carries its own translated title and description on <html>,
    // so this works on the privacy page and the 404 as well as the homepage.
    var root = document.documentElement;
    var title = root.getAttribute('data-title-' + lang);
    if (title) document.title = title;
    var description = root.getAttribute('data-desc-' + lang);
    var descMeta = $('meta[name="description"]');
    if (description && descMeta) descMeta.setAttribute('content', description);

    $$('.lang button').forEach(function (btn) {
      var on = btn.getAttribute('data-lang') === lang;
      btn.className = on ? 'on' : '';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (!opts.silent) {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode */ }
    }
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  // ?lang= wins, then a previous choice, then the browser, then Portuguese.
  function initialLang() {
    var fromQuery = (location.search.match(/[?&]lang=(pt|es)\b/) || [])[1];
    if (fromQuery) return fromQuery;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) { /* private mode */ }
    var nav = (navigator.language || '').toLowerCase();
    if (nav.indexOf('es') === 0) return 'es';
    return 'pt';
  }

  $$('.lang button').forEach(function (btn) {
    btn.addEventListener('click', function () { setLang(btn.getAttribute('data-lang')); });
  });

  setLang(initialLang(), { silent: true });

  // Kept on window because the markup used to call it inline, and because it
  // is genuinely useful from the console.
  window.setLang = setLang;

  /* ---------------------------------------------------------------------
   * Web font
   *
   * The stylesheet ships as media="print" so it never blocks the first paint;
   * flipping it here applies it. The Content-Security-Policy forbids inline
   * handlers, which is why this is not an onload attribute on the tag.
   * ------------------------------------------------------------------- */

  var webfont = $('#webfont');
  if (webfont) webfont.media = 'all';


  /* ---------------------------------------------------------------------
   * Phone number
   *
   * Kept out of the markup so it isn't harvested by scrapers that read the
   * page source. Assembled here, wired to the WhatsApp links, and shown in
   * full only when a visitor asks for it.
   * ------------------------------------------------------------------- */

  var PH = ['351', '913', '662', '883'];
  function waNumber() { return PH.join(''); }
  function prettyNumber() { return '+' + PH[0] + ' ' + PH[1] + ' ' + PH[2] + ' ' + PH[3]; }

  $$('[data-wa]').forEach(function (a) {
    a.href = 'https://wa.me/' + waNumber();
    a.target = '_blank';
    a.rel = 'noopener';
  });

  $$('[data-reveal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = btn.closest('.phone-mask');
      var out = wrap && wrap.querySelector('.phone-num');
      if (!out) return;
      out.textContent = prettyNumber();
      out.hidden = false;
      btn.hidden = true;
    });
  });

  /* ---------------------------------------------------------------------
   * Mobile navigation
   * ------------------------------------------------------------------- */

  var burger = $('#burger');
  var mobilenav = $('#mobilenav');

  function closeNav() {
    if (!burger || !mobilenav) return;
    mobilenav.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
  }

  if (burger && mobilenav) {
    burger.addEventListener('click', function () {
      var open = mobilenav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('a', mobilenav).forEach(function (a) { a.addEventListener('click', closeNav); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobilenav.classList.contains('open')) {
        closeNav();
        burger.focus();
      }
    });
  }

  /* ---------------------------------------------------------------------
   * Highlight the section currently in view
   * ------------------------------------------------------------------- */

  var navLinks = $$('#mainnav a[href^="#"]');
  var sections = navLinks
    .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      var current = null;
      for (var i = 0; i < sections.length; i++) {
        if (visible[sections[i].id]) { current = sections[i].id; break; }
      }
      navLinks.forEach(function (a) {
        if (a.getAttribute('href') === '#' + current) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-70px 0px -60% 0px' });
    sections.forEach(function (el) { spy.observe(el); });
  }

  /* ---------------------------------------------------------------------
   * Reveal on scroll — decorative, and skipped when motion is reduced
   * ------------------------------------------------------------------- */

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var targets = $$('.steps, .tiers, .tbl, .cases, .faq, .sim-grid, .cmp-cols');
    targets.forEach(function (el) { el.classList.add('reveal'); });
    var reveal = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (el) { reveal.observe(el); });
  }

  /* ---------------------------------------------------------------------
   * Footer year
   * ------------------------------------------------------------------- */

  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------------------------------------------------------------------
   * Lead form
   *
   * While the Formspree action is still the placeholder, submitting hands the
   * enquiry to WhatsApp instead, so no lead is lost.
   * ------------------------------------------------------------------- */

  var form = $('#leadform');
  if (form) {
    var msg = $('#formmsg');

    var show = function (text, ok) {
      msg.textContent = text;
      msg.style.display = 'block';
      msg.style.background = ok ? '#E4F0EA' : '#FBEAEA';
      msg.style.color = ok ? '#1F6B4A' : '#A02020';
    };

    var T = {
      sending: { pt: 'A enviar…', es: 'Enviando…' },
      received: { pt: 'Recebido. Respondemos em 24 horas.', es: 'Recibido. Te respondemos en 24 horas.' },
      failed: {
        pt: 'Não foi possível enviar. Fala connosco por WhatsApp.',
        es: 'No se pudo enviar. Escríbenos por WhatsApp.'
      },
      whatsapp: {
        pt: 'Abrimos o WhatsApp com os teus dados. Envia a mensagem para concluir.',
        es: 'Abrimos WhatsApp con tus datos. Envía el mensaje para terminar.'
      }
    };
    var t = function (key) {
      return T[key][document.documentElement.lang.slice(0, 2) === 'es' ? 'es' : 'pt'];
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var es = document.documentElement.lang.slice(0, 2) === 'es';
      var unconfigured = form.action.indexOf('YOUR_FORM_ID') !== -1 || !form.hasAttribute('data-netlify');
      var data = new FormData(form);

      if (unconfigured) {
        var lines = [];
        lines.push((es ? 'Hola, soy ' : 'Olá, sou ') + (data.get('nome') || ''));
        lines.push('Email: ' + (data.get('email') || ''));
        lines.push('Tel: ' + (data.get('telefone') || ''));
        lines.push((es ? 'Tipo: ' : 'Tipo: ') + (data.get('tipo') || ''));
        lines.push((es ? 'Presupuesto: ' : 'Orçamento: ') + (data.get('orcamento') || ''));
        if (data.get('detalhes')) lines.push('\n' + data.get('detalhes'));
        window.open('https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
        show(t('whatsapp'), true);
        return;
      }

      var btn = form.querySelector('button[type=submit]');
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = t('sending');

      // Netlify Forms reads url-encoded bodies posted to any page on the site.
      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(data).toString()
      })
        .then(function (res) {
          if (res.ok) { form.reset(); show(t('received'), true); }
          else show(t('failed'), false);
        })
        .catch(function () { show(t('failed'), false); })
        .finally(function () { btn.disabled = false; btn.textContent = label; });
    });
  }

  /* ---------------------------------------------------------------------
   * Marketplace comparison links
   * ------------------------------------------------------------------- */

  (function comparison() {
    var makeEl = $('#cmpMake');
    if (!makeEl) return;

    var slug = function (value) {
      return (value || '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    };

    // mobile.de identifies makes by numeric id. Only the ones we have verified
    // are wired up; anything else opens with the price and year filters set and
    // no make preselected.
    var MOBILE_DE_MAKES = {
      audi: '1900', bmw: '3500', citroen: '5300', dacia: '6600', fiat: '8600',
      ford: '9000', honda: '11000', hyundai: '11600', jaguar: '12200',
      jeep: '12400', kia: '13200', 'land-rover': '13950', mazda: '16800',
      'mercedes-benz': '17200', mini: '17700', nissan: '18700', opel: '19000',
      peugeot: '20100', porsche: '20800', renault: '22500', seat: '22900',
      skoda: '22800', tesla: '135', toyota: '24100', volkswagen: '25200',
      volvo: '25100', vw: '25200'
    };

    var ids = ['cmpMake', 'cmpModel', 'cmpYear', 'cmpPrice'];

    function build() {
      var make = $('#cmpMake').value;
      var model = $('#cmpModel').value;
      var year = $('#cmpYear').value;
      var price = $('#cmpPrice').value;
      var makeSlug = slug(make);
      var modelSlug = slug(model);

      var as = 'https://www.autoscout24.com/lst';
      if (makeSlug) as += '/' + makeSlug + (modelSlug ? '/' + modelSlug : '');
      as += '?atype=C&cy=D%2CA%2CB%2CE%2CF%2CI%2CL%2CNL&ustate=N%2CU&damaged_listing=exclude&sort=price&desc=0';
      if (year) as += '&fregfrom=' + year;
      if (price) as += '&priceto=' + price;
      $('#btnAS').href = as;

      var md = 'https://suchen.mobile.de/fahrzeuge/search.html?isSearchRequest=true&scopeId=C'
        + '&damageUnrepaired=NO_DAMAGE_UNREPAIRED&sfmr=false'
        + '&sortOption.sortBy=price.consumerGrossEuro&sortOption.sortOrder=ASCENDING';
      if (MOBILE_DE_MAKES[makeSlug]) md += '&makeModelVariant1.makeId=' + MOBILE_DE_MAKES[makeSlug];
      if (modelSlug) md += '&makeModelVariant1.modelDescription=' + encodeURIComponent(model.trim());
      if (year) md += '&minFirstRegistrationDate=' + year + '-01-01';
      if (price) md += '&maxPrice=' + price;
      $('#btnMD').href = md;

      var sv = 'https://www.standvirtual.com/carros';
      if (makeSlug) sv += '/' + makeSlug + (modelSlug ? '/' + modelSlug : '');
      var svq = [];
      if (price) svq.push('search%5Bfilter_float_price%3Ato%5D=' + price);
      if (year) svq.push('search%5Bfilter_float_first_registration_year%3Afrom%5D=' + year);
      if (svq.length) sv += '?' + svq.join('&');
      $('#btnSV').href = sv;

      var keywords = (make + ' ' + model).trim();
      var wp = 'https://es.wallapop.com/app/search?category_ids=100&order_by=price_low_to_high';
      if (keywords) wp += '&keywords=' + encodeURIComponent(keywords);
      if (price) wp += '&max_sale_price=' + price;
      $('#btnWP').href = wp;
    }

    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', build);
      el.addEventListener('change', build);
    });
    build();
  })();
})();
