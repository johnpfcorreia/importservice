/* ---------------------------------------------------------------------------
 * listing-parse.js — the parts of listing extraction that do not need a
 * network: value coercion, fuel names, the labelled-spec-text rules and the
 * sanity filters.
 *
 * Shared deliberately. The Netlify function requires it to parse a page it
 * fetched; the browser loads it to parse a spec block someone pasted, which is
 * how a mobile.de listing gets read at all (they refuse server-side reads).
 * ------------------------------------------------------------------------- */
(function (root, factory) {
  var api = factory();
  root.ListingParse = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // First non-empty write wins, so higher-confidence sources go first.
  function assign(target, key, value) {
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'number' && !isFinite(value)) return;
    if (target[key] === null || target[key] === undefined) target[key] = value;
  }

  function merge() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var src = arguments[i] || {};
      for (var key in src) if (Object.prototype.hasOwnProperty.call(src, key)) assign(out, key, src[key]);
    }
    return out;
  }

  const FUEL_PATTERNS = [
    [/plug[\s-]?in|phev|hibrido\s+enchufable|h[íi]brido\s+plug/i, 'phev'],
    [/elektro|electric|el[ée]ctric|elettric|eletric/i, 'electric'],
    [/hybrid|h[íi]brid|ibrid/i, 'hev'],
    [/diesel|gas[óo]leo|gasoil|gasolio|dieselkraftstoff/i, 'diesel'],
    [/lpg|autogas|gpl|g[áa]s\s+natural|cng|erdgas|gnc/i, 'gas'],
    [/benzin|petrol|gasolina|essence|benzina|gasoline|super/i, 'petrol']
  ];

  function normaliseFuel(raw) {
    if (!raw) return null;
    const s = String(raw);
    for (const [re, value] of FUEL_PATTERNS) {
      if (re.test(s)) return value;
    }
    return null;
  }

  // WLTP replaced NEDC for all new registrations from January 2019.
  function inferCycle(firstRegistration) {
    if (!firstRegistration) return 'WLTP';
    const year = parseInt(String(firstRegistration).slice(0, 4), 10);
    if (!year) return 'WLTP';
    return year >= 2019 ? 'WLTP' : 'NEDC';
  }


  // "1.998 cm³" -> 1998 ; "2,0" -> 2 ; "120 g/km" -> 120
  function toNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    let s = String(value).replace(/[ \s]/g, '');
    const m = s.match(/-?[\d.,]+/);
    if (!m) return null;
    s = m[0];
    // Decide which separator is the decimal one by looking at the last group.
    if (s.includes('.') && s.includes(',')) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (s.includes('.')) {
      if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // Normalise anything date-shaped to YYYY-MM.
  function toYearMonth(value) {
    if (!value) return null;
    const s = String(value).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})/))) return `${m[1]}-${m[2]}`;
    if ((m = s.match(/^(\d{1,2})[/.-](\d{4})/))) return `${m[2]}-${String(m[1]).padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) return `${m[3]}-${String(m[2]).padStart(2, '0')}`;
    if ((m = s.match(/\b(19|20)\d{2}\b/))) return `${m[0]}-01`;
    return null;
  }


  const TEXT_RULES = [
    ['displacement', /(?:hubraum|cilindrada|cylindr[ée]e|cilindrata|displacement|engine\s*size|cilindraje)\D{0,20}?([\d.,]+)\s*(?:cm[³3]|ccm|cc\b)/i],
    ['displacement', /([\d.,]+)\s*cm[³3]/i],
    ['co2', /co[₂2][^\d]{0,40}?([\d.,]+)\s*g\s*\/\s*km/i],
    ['co2', /(?:emiss[õo]es|emisiones|emissionen|emissions)[^\d]{0,40}?([\d.,]+)\s*g\s*\/\s*km/i],
    ['power', /([\d.,]+)\s*kw\b/i],
    ['mileage', /(?:km-stand|quilometragem|kilometraje|mileage|laufleistung)\D{0,20}?([\d.,]+)/i],
    ['mileage', /(?<!\/)\b([\d.,]+)\s*km\b(?!\s*\/)/i],
    ['firstRegistration', /(?:erstzulassung|first\s*registration|1\.?\s*matr[íi]cula|primeiro\s*registo|mise\s*en\s*circulation|immatricolazione)\D{0,20}?(\d{1,2}[/.-]\d{4}|\d{4}-\d{2}|\d{4})/i]
  ];

  function fromText(html) {
    // og: tags are the most reliable place to find the listing photo and title.
    const found = {};
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogImage) assign(found, 'image', ogImage[1]);
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitle) assign(found, 'title', ogTitle[1]);

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ');

    for (const [field, re] of TEXT_RULES) {
      const m = text.match(re);
      if (!m) continue;
      assign(found, field, field === 'firstRegistration' ? toYearMonth(m[1]) : toNumber(m[1]));
    }
    assign(found, 'fuel', normaliseFuel(
      (text.match(/(?:kraftstoff|combust[íi]vel|combustible|carburant|fuel\s*type|alimentazione)\s*:?\s*([A-Za-zÀ-ÿ\s-]{3,30})/i) || [])[1]
    ));
    return found;
  }


  // Reject values that are obviously the wrong field — a "1.4" engine picked up
  // as 1 cm3, a mileage matched as CO2, and so on.
  function sanitise(v) {
    const out = { ...v };

    if (out.displacement !== null && out.displacement !== undefined) {
      // Litres slipped in instead of cm3.
      if (out.displacement > 0 && out.displacement < 20) out.displacement = Math.round(out.displacement * 1000);
      if (out.displacement < 50 || out.displacement > 9000) out.displacement = null;
    }
    if (out.co2 !== null && out.co2 !== undefined) {
      if (out.co2 < 0 || out.co2 > 600) out.co2 = null;
    }
    if (out.power !== null && out.power !== undefined) {
      if (out.power < 5 || out.power > 1500) out.power = null;
    }
    if (out.mileage !== null && out.mileage !== undefined) {
      if (out.mileage < 0 || out.mileage > 2000000) out.mileage = null;
    }
    if (out.price !== null && out.price !== undefined) {
      if (out.price < 100 || out.price > 5000000) out.price = null;
    }
    if (out.image && !/^https:\/\//i.test(out.image)) out.image = null;
    if (out.firstRegistration) {
      const year = parseInt(out.firstRegistration.slice(0, 4), 10);
      const thisYear = new Date().getFullYear();
      if (!(year >= 1950 && year <= thisYear + 1)) out.firstRegistration = null;
    }
    return out;
  }


  return {
    assign: assign, merge: merge,
    toNumber: toNumber, toYearMonth: toYearMonth,
    normaliseFuel: normaliseFuel, inferCycle: inferCycle,
    fromText: fromText, sanitise: sanitise,
    FUEL_PATTERNS: FUEL_PATTERNS, TEXT_RULES: TEXT_RULES
  };
});
