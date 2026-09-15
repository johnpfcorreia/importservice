/* ---------------------------------------------------------------------------
 * tax-pt.js — Portuguese vehicle tax tables and calculators (ISV + IUC).
 *
 * Tables transcribed from the Código do ISV (artigos 7.º, 8.º, 8.º-A e 11.º)
 * and the Código do IUC (artigos 9.º e 10.º), rates in force for 2026.
 * The Orçamento do Estado para 2026 left the ISV rates unchanged from 2024/2025.
 *
 * Everything here is pure: no DOM, no network. `simulator.js` drives the UI.
 *
 * These are indicative figures. The binding value is the one the Autoridade
 * Tributária settles on the DAV, after documentary verification.
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';

  /* -- ISV · componente de cilindrada ------------------------------------ */
  /* Each bracket: cc up to `max` pays `rate` per cm3, minus `deduct`.       */

  var CYLINDER = {
    // Tabela A — ligeiros de passageiros
    A: [
      { max: 1000, rate: 1.09, deduct: 849.03 },
      { max: 1250, rate: 1.18, deduct: 850.69 },
      { max: Infinity, rate: 5.61, deduct: 6194.88 }
    ],
    // Tabela B — ligeiros de mercadorias e de utilização mista
    B: [
      { max: 1250, rate: 5.30, deduct: 3331.68 },
      { max: Infinity, rate: 12.58, deduct: 12138.47 }
    ]
  };

  /* -- ISV · componente ambiental ---------------------------------------- */
  /* Keyed by fuel family + homologation cycle. Same shape: g/km up to `max` */
  /* pays `rate` per g/km, minus `deduct`.                                   */

  var ENVIRONMENTAL = {
    'petrol/WLTP': [
      { max: 110, rate: 0.44, deduct: 43.02 },
      { max: 115, rate: 1.10, deduct: 115.80 },
      { max: 120, rate: 1.38, deduct: 147.79 },
      { max: 130, rate: 5.27, deduct: 619.17 },
      { max: 145, rate: 6.38, deduct: 762.73 },
      { max: 175, rate: 41.54, deduct: 5819.56 },
      { max: 195, rate: 51.38, deduct: 7247.39 },
      { max: 235, rate: 193.01, deduct: 34190.52 },
      { max: Infinity, rate: 233.81, deduct: 41910.96 }
    ],
    'diesel/WLTP': [
      { max: 110, rate: 1.72, deduct: 11.50 },
      { max: 120, rate: 18.96, deduct: 1906.19 },
      { max: 140, rate: 65.04, deduct: 7360.85 },
      { max: 150, rate: 127.40, deduct: 16080.57 },
      { max: 160, rate: 160.81, deduct: 21176.06 },
      { max: 170, rate: 221.69, deduct: 29227.38 },
      { max: 190, rate: 274.08, deduct: 36987.98 },
      { max: Infinity, rate: 282.35, deduct: 38271.32 }
    ],
    'petrol/NEDC': [
      { max: 99, rate: 4.62, deduct: 427.00 },
      { max: 115, rate: 8.09, deduct: 750.99 },
      { max: 145, rate: 52.56, deduct: 5903.94 },
      { max: 175, rate: 61.24, deduct: 7140.17 },
      { max: 195, rate: 155.97, deduct: 23627.27 },
      { max: Infinity, rate: 205.65, deduct: 33390.12 }
    ],
    'diesel/NEDC': [
      { max: 79, rate: 5.78, deduct: 439.04 },
      { max: 95, rate: 23.45, deduct: 1848.58 },
      { max: 120, rate: 79.22, deduct: 7195.63 },
      { max: 140, rate: 175.73, deduct: 18924.92 },
      { max: 160, rate: 195.43, deduct: 21720.92 },
      { max: Infinity, rate: 268.42, deduct: 33447.90 }
    ]
  };

  /* -- ISV · Tabela C — motociclos, triciclos e quadriciclos -------------- */
  /* Flat amount per displacement bracket. Under 120 cm3 is not taxed.       */

  var MOTORCYCLE = [
    { max: 119, amount: 0 },
    { max: 250, amount: 73.78 },
    { max: 350, amount: 91.63 },
    { max: 500, amount: 122.57 },
    { max: 750, amount: 184.45 },
    { max: Infinity, amount: 245.14 }
  ];

  /* -- ISV · Tabela D — redução por anos de uso --------------------------- */
  /* Only for used vehicles brought in from another EU member state. Since   */
  /* 2025 the same percentage applies to both components and to the diesel   */
  /* particulate surcharge.                                                  */

  var AGE_RELIEF = [
    { years: 1, relief: 0.10 },
    { years: 2, relief: 0.20 },
    { years: 3, relief: 0.28 },
    { years: 4, relief: 0.35 },
    { years: 5, relief: 0.43 },
    { years: 6, relief: 0.52 },
    { years: 7, relief: 0.60 },
    { years: 8, relief: 0.65 },
    { years: 9, relief: 0.70 },
    { years: 10, relief: 0.75 },
    { years: Infinity, relief: 0.80 }
  ];

  /* -- ISV · artigo 8.º, taxas intermédias -------------------------------- */
  /* Share of the table tax actually payable.                                */

  var INTERMEDIATE_RATE = {
    none: 1.00,
    phev: 0.25,   // plug-in: autonomia >= 50 km e CO2 <= 50 g/km (80 sob Euro 6e-bis)
    hev: 0.60,    // hibrido nao plug-in
    gas: 0.40     // GPL / gas natural
  };

  /* -- ISV · artigo 7.º-A, agravamento de particulas --------------------- */

  var PARTICULATE_SURCHARGE = { A: 500, B: 250 };

  /* -- ISV · artigo 7.º, montante minimo ---------------------------------- */

  var MINIMUM_ISV = 100;

  /* -- IUC --------------------------------------------------------------- */

  var IUC = {
    // Categoria A — primeira matricula ate 30-06-2007. Bands by period.
    A: {
      petrol: [
        { max: 1000, v: [19.90, 12.20, 8.80] },
        { max: 1300, v: [39.95, 22.45, 12.55] },
        { max: 1750, v: [62.40, 34.87, 17.49] },
        { max: 2600, v: [158.31, 83.49, 36.09] },
        { max: 3500, v: [287.49, 156.54, 79.72] },
        { max: Infinity, v: [512.23, 263.11, 120.90] }
      ],
      diesel: [
        { max: 1500, v: [22.48, 14.18, 10.19] },
        { max: 2000, v: [45.13, 25.37, 14.18] },
        { max: 3000, v: [70.50, 39.40, 19.76] },
        { max: Infinity, v: [178.86, 94.33, 40.77] }
      ]
    },
    // Categoria B — primeira matricula a partir de 01-07-2007.
    B: {
      cylinder: [
        { max: 1250, amount: 31.77 },
        { max: 1750, amount: 63.74 },
        { max: 2500, amount: 127.35 },
        { max: Infinity, amount: 435.84 }
      ],
      co2: {
        NEDC: [
          { max: 120, amount: 65.15, extra: 0 },
          { max: 180, amount: 97.63, extra: 0 },
          { max: 250, amount: 212.04, extra: 31.77 },
          { max: Infinity, amount: 363.25, extra: 63.74 }
        ],
        WLTP: [
          { max: 140, amount: 65.15, extra: 0 },
          { max: 205, amount: 97.63, extra: 0 },
          { max: 260, amount: 212.04, extra: 31.77 },
          { max: Infinity, amount: 363.25, extra: 63.74 }
        ]
      },
      // Coeficiente de ano de matricula.
      coefficient: { 2007: 1.00, 2008: 1.05, 2009: 1.10 },
      coefficientFrom2010: 1.15,
      dieselSurcharge: [
        { max: 1250, amount: 5.02 },
        { max: 1750, amount: 10.07 },
        { max: 2500, amount: 20.12 },
        { max: Infinity, amount: 68.85 }
      ]
    },
    // Categoria E — motociclos.
    E: [
      { max: 119, amount: 0 },
      { max: 250, amount: 6.19 },
      { max: 350, amount: 8.76 },
      { max: 500, amount: 21.18 },
      { max: 750, amount: 63.62 },
      { max: Infinity, amount: 138.15 }
    ]
  };

  /* -- helpers ----------------------------------------------------------- */

  function bracket(table, value) {
    for (var i = 0; i < table.length; i++) {
      if (value <= table[i].max) return table[i];
    }
    return table[table.length - 1];
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // Whole + fractional years between a first-registration date and `now`.
  function yearsSince(dateStr, now) {
    var d = parseDate(dateStr);
    if (!d) return null;
    var ref = now || new Date();
    var years = (ref - d) / (365.2425 * 24 * 3600 * 1000);
    return years < 0 ? 0 : years;
  }

  // Accepts YYYY-MM-DD, YYYY-MM, MM/YYYY and MM-YYYY. Day defaults to the 1st.
  function parseDate(value) {
    if (value instanceof Date) return isNaN(value) ? null : value;
    if (!value) return null;
    var s = String(value).trim();
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) {
      return new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
    }
    if ((m = s.match(/^(\d{1,2})[/-](\d{4})$/))) {
      return new Date(+m[2], +m[1] - 1, 1);
    }
    if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
      return new Date(+m[3], +m[2] - 1, +m[1]);
    }
    var d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function ageRelief(years) {
    if (years === null || years === undefined) return 0;
    for (var i = 0; i < AGE_RELIEF.length; i++) {
      if (years <= AGE_RELIEF[i].years) return AGE_RELIEF[i].relief;
    }
    return 0.80;
  }

  /* -- ISV --------------------------------------------------------------- */

  /**
   * calculateISV(input) -> breakdown
   *
   * input:
   *   category      'A' (ligeiro passageiros, default) | 'B' (mercadorias/mista)
   *                 | 'moto'
   *   displacement  cm3
   *   co2           g/km
   *   fuel          'petrol' | 'diesel' | 'electric' | 'phev' | 'hev' | 'gas'
   *   cycle         'WLTP' (default) | 'NEDC'
   *   condition     'used' (default) | 'new'
   *   firstRegistration  date of first registration (used vehicles)
   *   particulates  'low' (< 0,001 g/km, default) | 'high'
   *   exemption     'none' (default) | 'full'
   *   today         reference date for the age relief; defaults to now, and
   *                 exists so tests do not drift into the next age bracket
   */
  function calculateISV(input) {
    var o = input || {};
    var fuel = o.fuel || 'petrol';
    var category = o.category || 'A';
    var cycle = o.cycle === 'NEDC' ? 'NEDC' : 'WLTP';
    var cc = Math.max(0, Number(o.displacement) || 0);
    var co2 = Math.max(0, Number(o.co2) || 0);
    var isUsed = o.condition !== 'new';

    var out = {
      cylinderComponent: 0,
      environmentalComponent: 0,
      intermediateRate: 1,
      particulateSurcharge: 0,
      ageYears: null,
      ageRelief: 0,
      reliefAmount: 0,
      total: 0,
      notes: []
    };

    if (isUsed) {
      out.ageYears = yearsSince(o.firstRegistration, o.today);
      out.ageRelief = ageRelief(out.ageYears);
      // No date means no Tabela D reduction, so this is the new-vehicle tax.
      // Flag it rather than let it pass as a used-import figure.
      if (out.ageYears === null) out.notes.push('no-registration-date');
    }

    if (o.exemption === 'full') {
      out.notes.push('exempt');
      return out;
    }

    // Battery-electric vehicles are outside the scope of the ISV.
    if (fuel === 'electric') {
      out.notes.push('electric-exempt');
      return out;
    }

    if (category === 'moto') {
      out.cylinderComponent = bracket(MOTORCYCLE, cc).amount;
      out.reliefAmount = round2(out.cylinderComponent * out.ageRelief);
      out.total = round2(out.cylinderComponent - out.reliefAmount);
      return out;
    }

    // Componente de cilindrada.
    var cyl = bracket(CYLINDER[category] || CYLINDER.A, cc);
    out.cylinderComponent = Math.max(0, round2(cc * cyl.rate - cyl.deduct));

    // Componente ambiental. Plug-in and mild hybrids are homologated on the
    // petrol (or diesel) table; the relief comes from the intermediate rate.
    var family = (fuel === 'diesel') ? 'diesel' : 'petrol';
    var env = bracket(ENVIRONMENTAL[family + '/' + cycle], co2);
    // A negative environmental component is not clipped to zero: the code
    // deducts it from the cylinder component, which is what makes low-emission
    // cars cheap. Flooring it here overcharges every clean car.
    out.environmentalComponent = round2(co2 * env.rate - env.deduct);

    // Taxa intermédia (artigo 8.º).
    out.intermediateRate = INTERMEDIATE_RATE[fuel] || 1;
    var base = (out.cylinderComponent + out.environmentalComponent) * out.intermediateRate;

    // Agravamento por partículas — diesel only, and it is reduced by Tabela D
    // in the same proportion as the components.
    if (family === 'diesel' && o.particulates === 'high') {
      out.particulateSurcharge = PARTICULATE_SURCHARGE[category] || PARTICULATE_SURCHARGE.A;
      base += out.particulateSurcharge;
    }

    out.reliefAmount = round2(base * out.ageRelief);
    out.total = Math.max(0, round2(base - out.reliefAmount));

    // Artigo 7.º: the tax payable is never less than 100 EUR.
    if (out.total < MINIMUM_ISV) {
      out.total = MINIMUM_ISV;
      out.notes.push('minimum-applied');
    }
    return out;
  }

  /* -- IUC --------------------------------------------------------------- */

  function calculateIUC(input) {
    var o = input || {};
    var fuel = o.fuel || 'petrol';
    var cc = Math.max(0, Number(o.displacement) || 0);
    var co2 = Math.max(0, Number(o.co2) || 0);
    var cycle = o.cycle === 'NEDC' ? 'NEDC' : 'WLTP';
    var reg = parseDate(o.firstRegistration);

    var out = { category: null, cylinder: 0, co2: 0, coefficient: 1, extra: 0, dieselSurcharge: 0, total: 0, notes: [] };

    if (o.category === 'moto') {
      out.category = 'E';
      out.cylinder = bracket(IUC.E, cc).amount;
      out.total = round2(out.cylinder);
      return out;
    }

    if (fuel === 'electric') {
      out.category = 'B';
      out.notes.push('electric-exempt');
      return out;
    }

    if (!reg) return out;

    // Categoria A covers first registrations up to 30 June 2007.
    if (reg < new Date(2007, 6, 1)) {
      out.category = 'A';
      var year = reg.getFullYear();
      var col = year >= 1996 ? 0 : (year >= 1990 ? 1 : 2);
      var tableA = IUC.A[fuel === 'diesel' ? 'diesel' : 'petrol'];
      // Categoria A first registered before 1981 sits outside the IUC.
      if (year < 1981) {
        out.notes.push('pre-1981-exempt');
        return out;
      }
      out.cylinder = bracket(tableA, cc).v[col];
      out.total = round2(out.cylinder);
      return out;
    }

    out.category = 'B';
    out.cylinder = bracket(IUC.B.cylinder, cc).amount;
    var co2Band = bracket(IUC.B.co2[cycle], co2);
    out.co2 = co2Band.amount;
    out.extra = co2Band.extra;
    var regYear = reg.getFullYear();
    out.coefficient = regYear >= 2010
      ? IUC.B.coefficientFrom2010
      : (IUC.B.coefficient[regYear] || 1.00);
    if (fuel === 'diesel') {
      out.dieselSurcharge = bracket(IUC.B.dieselSurcharge, cc).amount;
    }
    // The registration-year coefficient applies to the whole table amount,
    // the high-CO2 additional included; only the diesel surcharge sits outside
    // it. Cross-checked against a commercial simulator, see the tests.
    out.total = round2((out.cylinder + out.co2 + out.extra) * out.coefficient + out.dieselSurcharge);
    return out;
  }

  /* -- Spain · IEDMT (impuesto de matriculacion) -------------------------
   * Impuesto Especial sobre Determinados Medios de Transporte, artigos 65 a 74
   * da Ley de Impuestos Especiales. Unlike the ISV it ignores displacement
   * entirely: a CO2 band sets a percentage, and that percentage is applied to
   * the taxable value of the vehicle.
   *
   * Two caveats the caller must surface:
   *   - For a used import Hacienda values the car from its own BOE tables,
   *     not from what the buyer paid. This returns an estimate on the value
   *     given to it.
   *   - Comunidades autonomas may raise the rates by up to 15%, and Canarias,
   *     Ceuta and Melilla have their own regime.
   * -------------------------------------------------------------------- */

  var IEDMT = [
    { max: 119.999, rate: 0 },
    { max: 159.999, rate: 0.0475 },
    { max: 199.999, rate: 0.0975 },
    { max: Infinity, rate: 0.1475 }
  ];

  var DGT_FEE = 99.77;

  function calculateIEDMT(input) {
    var o = input || {};
    var fuel = o.fuel || 'petrol';
    var co2 = Math.max(0, Number(o.co2) || 0);
    var value = Math.max(0, Number(o.value) || 0);
    var uplift = Math.min(Math.max(Number(o.regionalUplift) || 0, 0), 0.15);

    var out = {
      band: null, rate: 0, base: value, taxable: value,
      total: 0, registrationFee: DGT_FEE, notes: []
    };

    if (fuel === 'electric') {
      out.notes.push('electric-exempt');
      return out;
    }

    var band = bracket(IEDMT, co2);
    out.rate = round2(band.rate * (1 + uplift) * 10000) / 10000;
    out.band = band.max === Infinity ? '200+' : ('<=' + Math.floor(band.max));

    if (out.rate === 0) {
      out.notes.push('below-threshold');
      return out;
    }
    if (!value) {
      out.notes.push('no-value');
      return out;
    }

    out.total = round2(value * out.rate);
    return out;
  }

  root.TaxPT = {
    calculateISV: calculateISV,
    calculateIEDMT: calculateIEDMT,
    calculateIUC: calculateIUC,
    parseDate: parseDate,
    yearsSince: yearsSince,
    ageRelief: ageRelief,
    tables: {
      CYLINDER: CYLINDER,
      ENVIRONMENTAL: ENVIRONMENTAL,
      MOTORCYCLE: MOTORCYCLE,
      AGE_RELIEF: AGE_RELIEF,
      INTERMEDIATE_RATE: INTERMEDIATE_RATE,
      PARTICULATE_SURCHARGE: PARTICULATE_SURCHARGE,
      MINIMUM_ISV: MINIMUM_ISV,
      IEDMT: IEDMT,
      IUC: IUC
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = root.TaxPT;
})(typeof window !== 'undefined' ? window : globalThis);
