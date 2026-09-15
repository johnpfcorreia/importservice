/* ---------------------------------------------------------------------------
 * simulator.js — the ISV / IUC panel.
 *
 * Two ways in:
 *   1. Paste a listing URL. `/api/listing` reads the page server-side and
 *      hands back displacement, CO2, fuel and first registration.
 *   2. Type the numbers straight in. The result recalculates on every change.
 *
 * The first path is a shortcut, never a dependency: if a marketplace blocks
 * the read, the fields stay editable and the panel keeps working.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var form = document.getElementById('simForm');
  if (!form || !window.TaxPT) return;

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    url: $('simUrl'), paste: $('simPaste'), fetchBtn: $('simFetch'), status: $('simStatus'),
    country: $('simCountry'), value: $('simValue'), valueRow: $('simValueRow'),
    category: $('simCategory'), fuel: $('simFuel'), condition: $('simCondition'),
    cc: $('simCC'), co2: $('simCO2'), cycle: $('simCycle'), reg: $('simReg'),
    particles: $('simParticles'), particlesRow: $('simParticlesRow'),
    total: $('simTotal'), totalNote: $('simTotalNote'), rows: $('simRows'),
    cyl: $('simCyl'), env: $('simEnv'),
    rate: $('simRate'), rateRow: $('simRateRow'),
    part: $('simPart'), partRow: $('simPartRow'),
    relief: $('simRelief'), reliefRow: $('simReliefRow'), reliefLabel: $('simReliefLabel'),
    sum: $('simSum'), iuc: $('simIuc'), cta: $('simCta'),
    car: $('simCar'), carImg: $('simCarImg'), carTitle: $('simCarTitle'),
    carMeta: $('simCarMeta'), carLink: $('simCarLink')
  };

  var lang = function () {
    return document.documentElement.lang.slice(0, 2) === 'es' ? 'es' : 'pt';
  };

  var TEXT = {
    reading: { pt: 'A ler o anúncio…', es: 'Leyendo el anuncio…' },
    read: {
      pt: 'Lemos o anúncio e preenchemos tudo. Confirma os valores antes de avançar.',
      es: 'Hemos leído el anuncio y lo hemos rellenado todo. Confirma los valores antes de continuar.'
    },
    missingPrefix: {
      pt: 'Lemos o anúncio, mas ele não declara ',
      es: 'Hemos leído el anuncio, pero no declara '
    },
    missingSuffix: {
      pt: '. Está na ficha técnica do anúncio. Preenche o campo destacado.',
      es: '. Está en la ficha técnica del anuncio. Rellena el campo destacado.'
    },
    and: { pt: ' nem ', es: ' ni ' },
    blocked: {
      pt: 'Este anúncio não se deixou ler automaticamente. Copia a cilindrada, as emissões e a data de matrícula da ficha técnica e preenche abaixo. O cálculo é o mesmo.',
      es: 'Este anuncio no se ha dejado leer automáticamente. Copia la cilindrada, las emisiones y la fecha de matriculación de la ficha técnica y rellena abajo. El cálculo es el mismo.'
    },
    unsupported: {
      pt: 'Só sabemos ler AutoScout24, coches.net, StandVirtual e mobile.de. Para outro site, preenche os campos à mão.',
      es: 'Solo sabemos leer AutoScout24, coches.net, StandVirtual y mobile.de. Para otra web, rellena los campos a mano.'
    },
    readText: {
      pt: 'Lemos a ficha que colaste. Confirma os valores antes de avançar.',
      es: 'Hemos leído la ficha que has pegado. Confirma los valores antes de continuar.'
    },
    noText: {
      pt: 'Não encontrámos aí a cilindrada nem as emissões. Cola a ficha técnica do anúncio, ou preenche os campos abaixo.',
      es: 'No hemos encontrado ahí la cilindrada ni las emisiones. Pega la ficha técnica del anuncio, o rellena los campos de abajo.'
    },
    badUrl: {
      pt: 'Isso não parece um link. Cola o endereço completo do anúncio.',
      es: 'Eso no parece un enlace. Pega la dirección completa del anuncio.'
    },
    offline: {
      pt: 'Não conseguimos contactar o servidor. Preenche os campos à mão. O cálculo funciona à mesma.',
      es: 'No hemos podido contactar con el servidor. Rellena los campos a mano. El cálculo funciona igual.'
    },
    exempt: { pt: 'Isento de ISV', es: 'Exento de ISV' },
    exemptNote: {
      pt: 'Veículos 100% elétricos não pagam ISV nem IUC.',
      es: 'Los vehículos 100% eléctricos no pagan ISV ni IUC.'
    },
    prompt: {
      pt: 'Preenche a cilindrada e as emissões.',
      es: 'Rellena la cilindrada y las emisiones.'
    },
    promptDate: {
      pt: 'Falta a data da 1.ª matrícula — é ela que dá o desconto por anos de uso.',
      es: 'Falta la fecha de 1.ª matriculación — es la que da el descuento por años de uso.'
    },
    ready: {
      pt: 'Valor indicativo, antes de transporte e legalização.',
      es: 'Importe indicativo, antes de transporte y matriculación.'
    },
    reliefLabel: {
      pt: 'Desconto por anos de uso',
      es: 'Descuento por años de uso'
    },
    esPrompt: {
      pt: 'Preenche as emissões e o valor do veículo.',
      es: 'Rellena las emisiones y el valor del vehículo.'
    },
    esExempt: { pt: 'Isento de matriculação', es: 'Exento de matriculación' },
    esExemptNote: {
      pt: 'Abaixo de 120 g/km não há imposto de matriculação em Espanha. Paga-se apenas a taxa da DGT (99,77 €).',
      es: 'Por debajo de 120 g/km no hay impuesto de matriculación en España. Solo se paga la tasa de la DGT (99,77 €).'
    },
    esReady: {
      pt: 'Estimativa. Em usados, a Hacienda calcula sobre o valor das suas tabelas oficiais, não sobre o que pagaste. As comunidades autónomas podem agravar a taxa até 15%.',
      es: 'Estimación. En usados, Hacienda calcula sobre el valor de sus tablas oficiales, no sobre lo que pagaste. Las comunidades autónomas pueden incrementar el tipo hasta un 15%.'
    },
    esBand: { pt: 'Escalão de CO₂', es: 'Tramo de CO₂' },
    esFee: { pt: 'Taxa DGT', es: 'Tasa DGT' }
  };

  var t = function (key) { return TEXT[key][lang()]; };

  var money = function (value) {
    return new Intl.NumberFormat(lang() === 'es' ? 'es-ES' : 'pt-PT', {
      style: 'currency', currency: 'EUR',
      maximumFractionDigits: 0,
      // four-digit amounts are the common case here and read better grouped
      useGrouping: 'always'
    }).format(value);
  };

  var lastStatus = null;

  // Remembers what was said and which fields it named, so switching language
  // redraws the whole message translated, field names included.
  function setStatusKey(key, kind, fields) {
    lastStatus = { key: key, kind: kind, fields: fields || null };
    var message = t(key);
    if (lastStatus.fields && lastStatus.fields.length) {
      message += lastStatus.fields
        .map(function (f) { return FIELD_NAMES[f][lang()]; })
        .join(t('and')) + t('missingSuffix');
    }
    setStatus(message, kind);
  }

  function setStatus(message, kind) {
    if (!message) {
      lastStatus = null;
      el.status.className = 'sim-status';
      el.status.textContent = '';
      return;
    }
    el.status.className = 'sim-status show ' + (kind || 'ok');
    el.status.textContent = message;
  }

  /* -- calculation ------------------------------------------------------- */

  function readForm() {
    return {
      category: el.category.value,
      fuel: el.fuel.value,
      condition: el.condition.value,
      displacement: el.cc.value === '' ? null : Number(el.cc.value),
      co2: el.co2.value === '' ? null : Number(el.co2.value),
      cycle: el.cycle.value,
      firstRegistration: el.reg.value || null,
      particulates: el.particles.value,
      country: el.country ? el.country.value : 'PT',
      value: (el.value && el.value.value !== '') ? Number(el.value.value) : null
    };
  }

  function render() {
    var input = readForm();
    var isMoto = input.category === 'moto';
    var isElectric = input.fuel === 'electric';
    var isDiesel = input.fuel === 'diesel';
    var isSpain = input.country === 'ES';

    // Spain taxes the value of the car by CO2 band and ignores displacement,
    // so the fields on show change with the country.
    if (el.valueRow) el.valueRow.hidden = !isSpain;
    el.particlesRow.hidden = isSpain || !isDiesel;

    if (isSpain) { renderSpain(input, isElectric); return; }

    // Electric vehicles pay neither tax, so no further input is needed.
    if (isElectric) {
      el.total.firstChild.nodeValue = t('exempt');
      el.totalNote.textContent = t('exemptNote');
      el.rows.hidden = true;
      el.iuc.textContent = money(0);
      return;
    }

    // A motorcycle only needs displacement; everything else needs CO2 too.
    // A used vehicle also needs its first-registration date: without it the
    // Tabela D reduction is zero, so the figure shown would be the new-car
    // tax — several times the real bill on an older import.
    var haveEnough = input.displacement > 0
      && (isMoto || input.co2 !== null)
      && (input.condition === 'new' || !!input.firstRegistration);
    if (!haveEnough) {
      var needsDate = input.displacement > 0
        && (isMoto || input.co2 !== null)
        && input.condition !== 'new' && !input.firstRegistration;
      el.total.firstChild.nodeValue = '—';
      el.totalNote.textContent = needsDate ? t('promptDate') : t('prompt');
      el.rows.hidden = true;
      el.iuc.textContent = '—';
      return;
    }

    var isv = window.TaxPT.calculateISV(input);
    var iuc = window.TaxPT.calculateIUC(input);

    el.total.firstChild.nodeValue = money(isv.total);
    el.totalNote.textContent = t('ready');

    el.rows.hidden = false;
    el.cyl.textContent = money(isv.cylinderComponent);
    el.env.textContent = isMoto ? '—' : money(isv.environmentalComponent);

    var hasIntermediate = isv.intermediateRate !== 1;
    el.rateRow.hidden = !hasIntermediate;
    if (hasIntermediate) el.rate.textContent = '× ' + Math.round(isv.intermediateRate * 100) + '%';

    el.partRow.hidden = !isv.particulateSurcharge;
    if (isv.particulateSurcharge) el.part.textContent = '+ ' + money(isv.particulateSurcharge);

    var hasRelief = isv.ageRelief > 0;
    el.reliefRow.hidden = !hasRelief;
    if (hasRelief) {
      el.reliefLabel.textContent = t('reliefLabel') + ' (' + Math.round(isv.ageRelief * 100) + '%)';
      el.relief.textContent = '− ' + money(isv.reliefAmount);
    }

    el.sum.textContent = money(isv.total);
    el.iuc.textContent = money(iuc.total);
  }

  // Spain: Impuesto Especial sobre Determinados Medios de Transporte.
  function renderSpain(input, isElectric) {
    var res = window.TaxPT.calculateIEDMT(input);

    if (isElectric || res.notes.indexOf('below-threshold') !== -1) {
      el.total.firstChild.nodeValue = t('esExempt');
      el.totalNote.textContent = t('esExemptNote');
      el.rows.hidden = true;
      el.iuc.textContent = money(res.registrationFee);
      return;
    }

    if (input.co2 === null || !input.value) {
      el.total.firstChild.nodeValue = '—';
      el.totalNote.textContent = t('esPrompt');
      el.rows.hidden = true;
      el.iuc.textContent = '—';
      return;
    }

    el.total.firstChild.nodeValue = money(res.total);
    el.totalNote.textContent = t('esReady');

    el.rows.hidden = false;
    el.cyl.textContent = money(res.base);
    el.env.textContent = (res.rate * 100).toFixed(2).replace('.', ',') + '%';
    el.rateRow.hidden = true;
    el.partRow.hidden = true;
    el.reliefRow.hidden = true;
    el.sum.textContent = money(res.total);
    el.iuc.textContent = money(res.registrationFee);
  }

  // Row labels differ between the two regimes.
  function relabel() {
    var isSpain = el.country && el.country.value === 'ES';
    var es = lang() === 'es';
    var cylLabel = document.querySelector('[data-row="cyl"]');
    var envLabel = document.querySelector('[data-row="env"]');
    var iucLabel = document.querySelector('[data-row="iuc"]');
    if (cylLabel) cylLabel.textContent = isSpain
      ? (es ? 'Base imponible' : 'Valor tributável')
      : (es ? 'Componente de cilindrada' : 'Componente de cilindrada');
    if (envLabel) envLabel.textContent = isSpain
      ? t('esBand')
      : (es ? 'Componente ambiental' : 'Componente ambiental');
    if (iucLabel) iucLabel.textContent = isSpain
      ? t('esFee')
      : (es ? 'IUC anual' : 'IUC anual');
    var sumLabel = document.querySelector('[data-row="sum"]');
    if (sumLabel) sumLabel.textContent = isSpain
      ? (es ? 'Impuesto a pagar' : 'Imposto a pagar')
      : 'ISV a pagar';
  }

  /* -- prefill from a listing -------------------------------------------- */

  var integer = function (value) {
    return new Intl.NumberFormat(lang() === 'es' ? 'es-ES' : 'pt-PT').format(value);
  };

  // Show the actual car, so the visitor can see we read the right advert.
  function showCar(vehicle, href) {
    var v = vehicle || {};
    // Prefer the parsed make and model: og:title is often a price template
    // ("Mercedes-Benz for EUR 25,770") rather than the name of the car.
    var name = [v.make, v.model].filter(Boolean).join(' ') || v.title || '';
    if (!name && !v.image) { el.car.hidden = true; return; }

    if (v.image) {
      el.carImg.src = v.image;
      el.carImg.alt = name || '';
      el.carImg.hidden = false;
    } else {
      el.carImg.removeAttribute('src');
      el.carImg.hidden = true;
    }

    el.carTitle.textContent = name || '';

    var bits = [];
    if (v.firstRegistration) bits.push(v.firstRegistration.replace('-', '/'));
    if (v.mileage != null) bits.push(integer(Math.round(v.mileage)) + ' km');
    if (v.power != null) bits.push(Math.round(v.power) + ' kW');
    if (v.price != null) bits.push(money(v.price));
    el.carMeta.textContent = bits.join('  ·  ');

    el.carLink.href = href;
    el.car.hidden = false;
  }

  var FIELD_NAMES = {
    displacement: { pt: 'a cilindrada', es: 'la cilindrada' },
    co2: { pt: 'as emissões de CO₂', es: 'las emisiones de CO₂' },
    firstRegistration: { pt: 'a data de matrícula', es: 'la fecha de matriculación' }
  };

  // Fields the listing did not supply are cleared, not left holding the
  // worked-example defaults — a stale 142 g/km reads as if it came from the
  // advert, which would be worse than an empty box.
  function applyVehicle(vehicle) {
    var v = vehicle || {};
    var filled = [];
    var missing = [];

    var take = function (key, input, transform) {
      if (v[key] === null || v[key] === undefined || v[key] === '') {
        input.value = '';
        input.classList.add('needs-input');
        missing.push(key);
        return;
      }
      input.value = transform ? transform(v[key]) : v[key];
      input.classList.remove('needs-input');
      filled.push(key);
    };

    take('displacement', el.cc, Math.round);
    take('co2', el.co2, Math.round);
    take('firstRegistration', el.reg);

    if (v.cycle) el.cycle.value = v.cycle;
    if (v.fuel) {
      var match = Array.prototype.some.call(el.fuel.options, function (o) { return o.value === v.fuel; });
      if (match) { el.fuel.value = v.fuel; filled.push('fuel'); }
    }

    // Anything listed on a marketplace is by definition already registered.
    el.condition.value = 'used';

    return { filled: filled, missing: missing };
  }

  // Parse a spec block the visitor pasted. Same rules the server uses on a
  // fetched page, so "Hubraum 1.998 cm3" reads the same either way. Nothing
  // leaves the browser.
  function readPastedText(text) {
    if (!window.ListingParse) { setStatusKey('badUrl', 'err'); return; }

    var vehicle = window.ListingParse.sanitise(window.ListingParse.fromText(text));
    if (vehicle.firstRegistration) vehicle.cycle = window.ListingParse.inferCycle(vehicle.firstRegistration);

    var got = ['displacement', 'co2', 'firstRegistration', 'fuel']
      .filter(function (k) { return vehicle[k] !== null && vehicle[k] !== undefined; });

    if (!got.length) {
      el.car.hidden = true;
      setStatusKey('noText', 'err');
      return;
    }

    el.car.hidden = true;
    var result = applyVehicle(vehicle);
    render();
    if (result.missing.length) {
      setStatusKey('missingPrefix', 'warn', result.missing);
      var gap = form.querySelector('.needs-input');
      if (gap) gap.focus({ preventScroll: true });
    } else {
      setStatusKey('readText', 'ok');
    }
  }

  if (el.paste) {
    el.paste.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = el.url.value.trim();
      if (!raw) return;

      // A link goes to the server; anything else is treated as a pasted spec
      // block and parsed here, which is how a mobile.de listing gets read.
      var looksLikeLink = /^(https?:\/\/|www\.)\S+$/i.test(raw) || /^[\w.-]+\.\w{2,}\//.test(raw);
      if (!looksLikeLink) {
        readPastedText(raw);
        return;
      }

      var parsed;
      try {
        parsed = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
      } catch (err) {
        setStatusKey('badUrl', 'err');
        return;
      }

      var label = el.fetchBtn.textContent;
      el.fetchBtn.disabled = true;
      el.fetchBtn.textContent = '…';
      setStatusKey('reading', 'ok');

      fetch('/api/listing?url=' + encodeURIComponent(parsed.href), {
        headers: { Accept: 'application/json' }
      })
        .then(function (res) { return res.json().catch(function () { return null; }); })
        .then(function (data) {
          if (!data) { setStatusKey('offline', 'err'); return; }

          if (data.reason === 'unsupported-site') {
            el.car.hidden = true;
            setStatusKey('unsupported', 'warn');
            return;
          }

          showCar(data.vehicle, parsed.href);
          var result = applyVehicle(data.vehicle);
          render();

          if (!result.filled.length) {
            setStatusKey('blocked', 'warn');
          } else if (result.missing.length) {
            setStatusKey('missingPrefix', 'warn', result.missing);
          } else {
            setStatusKey('read', 'ok');
          }

          // Send the cursor to the first thing we could not read.
          var firstGap = form.querySelector('.needs-input');
          if (firstGap) firstGap.focus({ preventScroll: true });
        })
        .catch(function () { setStatusKey('offline', 'err'); })
        .finally(function () {
          el.fetchBtn.disabled = false;
          el.fetchBtn.textContent = label;
        });
    });
  }

  /* -- wiring ------------------------------------------------------------ */

  if (el.carImg) {
    el.carImg.addEventListener('error', function () { el.carImg.hidden = true; });
  }

  form.addEventListener('input', function () { relabel(); render(); });
  form.addEventListener('change', function () { relabel(); render(); });

  // Currency and copy are language-dependent, so redraw when it changes.
  document.addEventListener('langchange', function () {
    if (lastStatus) setStatusKey(lastStatus.key, lastStatus.kind, lastStatus.fields);
    relabel();
    render();
  });

  // Pass the simulated vehicle into the enquiry form.
  if (el.cta) {
    el.cta.addEventListener('click', function () {
      var details = document.getElementById('f-det');
      if (!details || details.value.trim()) return;
      var bits = [];
      if (el.url.value.trim()) bits.push(el.url.value.trim());
      if (el.cc.value) bits.push(el.cc.value + ' cm3');
      if (el.co2.value) bits.push(el.co2.value + ' g/km ' + el.cycle.value);
      if (el.reg.value) bits.push(el.reg.value);
      if (bits.length) details.value = bits.join(' · ');
    });
  }

  relabel();
  render();
})();
