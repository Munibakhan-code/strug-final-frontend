import { getUser } from "../store/auth";
import i18n from "../i18n/index.js";

export const PLATFORM_FEE = 0.08;

/** Platform stores AND charges prices in this currency (API / checkout baseline). */
// Prices are stored and CHARGED in CAD. The user's country only changes the DISPLAY
// currency (convertMoney CAD → local for rendering). Conversion is display-only and must
// never flow back into a charge amount, so users are always billed the exact CAD figure.
export const BASE_CURRENCY = "CAD";

/** ISO 3166-1 alpha-2 → currency (aligned with backend locale-geo.js). */
export const ISO_CURRENCY = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD", MX: "MXN", BR: "BRL",
  FR: "EUR", DE: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR",
  IN: "INR", PK: "PKR", BD: "BDT", JP: "JPY", CN: "CNY", KR: "KRW", CH: "CHF",
  SA: "SAR", AE: "AED", TR: "TRY", PL: "PLN", SE: "SEK", NO: "NOK", DK: "DKK",
  ZA: "ZAR", EG: "EGP", NG: "NGN", KE: "KES", GH: "GHS", PH: "PHP", SG: "SGD",
  HK: "HKD", TW: "TWD", TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", AR: "ARS",
  CL: "CLP", CO: "COP", PE: "PEN", RO: "RON", HU: "HUF", CZ: "CZK", IL: "ILS",
  QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD", LB: "LBP", NP: "NPR",
  LK: "LKR", FI: "EUR", AT: "EUR", GR: "EUR", LU: "EUR", MT: "EUR", CY: "EUR",
};

/**
 * 1 USD → target. These are the STATIC fallback rates (display only). At app start
 * `refreshExchangeRates()` overlays live values on top (see bottom of file); if the live
 * fetch fails or hasn't run, these ship-time approximations are used. Mutated in place so
 * `convertMoney` (which reads this object) picks up live rates without re-importing.
 */
export const EXCHANGE_RATES_FROM_USD = {
  USD: 1,
  CAD: 1.36,
  EUR: 0.92,
  GBP: 0.79,
  PKR: 278.5,
  INR: 83.2,
  BDT: 110.5,
  AUD: 1.53,
  NZD: 1.65,
  MXN: 17.1,
  BRL: 4.95,
  JPY: 149,
  CNY: 7.24,
  KRW: 1320,
  CHF: 0.88,
  SAR: 3.75,
  AED: 3.67,
  TRY: 32.5,
  PLN: 3.98,
  SEK: 10.5,
  NOK: 10.8,
  DKK: 6.88,
  ZAR: 18.2,
  EGP: 48.5,
  NGN: 1550,
  KES: 129,
  GHS: 14.2,
  PHP: 56,
  SGD: 1.34,
  HKD: 7.82,
  TWD: 31.5,
  THB: 35.5,
  VND: 24500,
  IDR: 15700,
  MYR: 4.72,
  ARS: 875,
  CLP: 920,
  COP: 3950,
  PEN: 3.72,
  RON: 4.58,
  HUF: 360,
  CZK: 23.2,
  ILS: 3.65,
  QAR: 3.64,
  KWD: 0.31,
  BHD: 0.38,
  OMR: 0.38,
  JOD: 0.71,
  LBP: 89500,
  NPR: 133,
  LKR: 305,
};

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "PYG", "UGX", "XAF", "XOF"]);

export const REGIONAL_CONFIG = {
  "United States": { tax: 0.0, currency: "USD" },
  "Canada": { tax: 0.13, currency: "CAD" },
  "Mexico": { tax: 0.16, currency: "MXN" },
  "Greenland": { tax: 0.0, currency: "DKK" },
  "Bermuda": { tax: 0.0, currency: "BMD" },
  "Argentina": { tax: 0.21, currency: "ARS" },
  "Bolivia": { tax: 0.13, currency: "BOB" },
  "Brazil": { tax: 0.17, currency: "BRL" },
  "Chile": { tax: 0.19, currency: "CLP" },
  "Colombia": { tax: 0.19, currency: "COP" },
  "Ecuador": { tax: 0.12, currency: "USD" },
  "Paraguay": { tax: 0.10, currency: "PYG" },
  "Peru": { tax: 0.18, currency: "PEN" },
  "Uruguay": { tax: 0.22, currency: "UYU" },
  "Venezuela": { tax: 0.16, currency: "VES" },
  "United Kingdom": { tax: 0.20, currency: "GBP" },
  "Ireland": { tax: 0.23, currency: "EUR" },
  "France": { tax: 0.20, currency: "EUR" },
  "Germany": { tax: 0.19, currency: "EUR" },
  "Netherlands": { tax: 0.21, currency: "EUR" },
  "Belgium": { tax: 0.21, currency: "EUR" },
  "Luxembourg": { tax: 0.17, currency: "EUR" },
  "Austria": { tax: 0.20, currency: "EUR" },
  "Switzerland": { tax: 0.081, currency: "CHF" },
  "Monaco": { tax: 0.20, currency: "EUR" },
  "Denmark": { tax: 0.25, currency: "DKK" },
  "Sweden": { tax: 0.25, currency: "SEK" },
  "Finland": { tax: 0.255, currency: "EUR" },
  "Norway": { tax: 0.25, currency: "NOK" },
  "Iceland": { tax: 0.24, currency: "ISK" },
  "Spain": { tax: 0.21, currency: "EUR" },
  "Portugal": { tax: 0.23, currency: "EUR" },
  "Italy": { tax: 0.22, currency: "EUR" },
  "Greece": { tax: 0.24, currency: "EUR" },
  "Malta": { tax: 0.18, currency: "EUR" },
  "Cyprus": { tax: 0.19, currency: "EUR" },
  "Israel": { tax: 0.18, currency: "ILS" },
  "Turkey": { tax: 0.20, currency: "TRY" },
  "Saudi Arabia": { tax: 0.15, currency: "SAR" },
  "United Arab Emirates": { tax: 0.05, currency: "AED" },
  "Qatar": { tax: 0.0, currency: "QAR" },
  "Kuwait": { tax: 0.0, currency: "KWD" },
  "Bahrain": { tax: 0.10, currency: "BHD" },
  "Oman": { tax: 0.05, currency: "OMR" },
  "Jordan": { tax: 0.16, currency: "JOD" },
  "Lebanon": { tax: 0.11, currency: "LBP" },
  "India": { tax: 0.18, currency: "INR" },
  "Pakistan": { tax: 0.17, currency: "PKR" },
  "Sri Lanka": { tax: 0.18, currency: "LKR" },
  "Bangladesh": { tax: 0.15, currency: "BDT" },
  "Nepal": { tax: 0.13, currency: "NPR" },
  "Bhutan": { tax: 0.0, currency: "BTN" },
  "Maldives": { tax: 0.06, currency: "MVR" },
  "Australia": { tax: 0.10, currency: "AUD" },
  "New Zealand": { tax: 0.15, currency: "NZD" },
  "Fiji": { tax: 0.09, currency: "FJD" },
  "Papua New Guinea": { tax: 0.10, currency: "PGK" },
  "Samoa": { tax: 0.15, currency: "WST" },
  "Tonga": { tax: 0.15, currency: "TOP" },
  "Vanuatu": { tax: 0.15, currency: "VUV" },
  "South Africa": { tax: 0.15, currency: "ZAR" },
  "Egypt": { tax: 0.14, currency: "EGP" },
  "Morocco": { tax: 0.20, currency: "MAD" },
  "Kenya": { tax: 0.16, currency: "KES" },
  "Nigeria": { tax: 0.075, currency: "NGN" },
  "Ghana": { tax: 0.15, currency: "GHS" },
  "Tanzania": { tax: 0.18, currency: "TZS" },
  "Uganda": { tax: 0.18, currency: "UGX" },
  "Rwanda": { tax: 0.18, currency: "RWF" },
  "Ethiopia": { tax: 0.15, currency: "ETB" },
  "China": { tax: 0.13, currency: "CNY" },
  "Japan": { tax: 0.10, currency: "JPY" },
  "South Korea": { tax: 0.10, currency: "KRW" },
  "Singapore": { tax: 0.09, currency: "SGD" },
  "Hong Kong": { tax: 0.0, currency: "HKD" },
  "Taiwan": { tax: 0.05, currency: "TWD" },
  "Thailand": { tax: 0.07, currency: "THB" },
  "Vietnam": { tax: 0.10, currency: "VND" },
  "Indonesia": { tax: 0.11, currency: "IDR" },
  "Malaysia": { tax: 0.06, currency: "MYR" },
  "Philippines": { tax: 0.12, currency: "PHP" },
  "Poland": { tax: 0.23, currency: "PLN" },
  "Romania": { tax: 0.19, currency: "RON" },
  "Hungary": { tax: 0.27, currency: "HUF" },
  "Czechia": { tax: 0.21, currency: "CZK" },
  "default": { tax: 0.05, currency: "USD" },
};

/** Currencies we have an FX rate AND formatting for — only these are safe to DISPLAY. */
const DISPLAYABLE_CURRENCIES = new Set(Object.keys(EXCHANGE_RATES_FROM_USD));

/** Sorted country names for the location picker (excludes the synthetic "default"). */
export const COUNTRY_OPTIONS = Object.keys(REGIONAL_CONFIG)
  .filter((c) => c !== "default")
  .sort((a, b) => a.localeCompare(b));

/** Country name → ISO 3166-1 alpha-2 (for flags). Keep in sync with REGIONAL_CONFIG. */
export const COUNTRY_ISO2 = {
  "United States": "US", "Canada": "CA", "Mexico": "MX", "Greenland": "GL",
  "Bermuda": "BM", "Argentina": "AR", "Bolivia": "BO", "Brazil": "BR", "Chile": "CL",
  "Colombia": "CO", "Ecuador": "EC", "Paraguay": "PY", "Peru": "PE", "Uruguay": "UY",
  "Venezuela": "VE", "United Kingdom": "GB", "Ireland": "IE", "France": "FR",
  "Germany": "DE", "Netherlands": "NL", "Belgium": "BE", "Luxembourg": "LU",
  "Austria": "AT", "Switzerland": "CH", "Monaco": "MC", "Denmark": "DK", "Sweden": "SE",
  "Finland": "FI", "Norway": "NO", "Iceland": "IS", "Spain": "ES", "Portugal": "PT",
  "Italy": "IT", "Greece": "GR", "Malta": "MT", "Cyprus": "CY", "Israel": "IL",
  "Turkey": "TR", "Saudi Arabia": "SA", "United Arab Emirates": "AE", "Qatar": "QA",
  "Kuwait": "KW", "Bahrain": "BH", "Oman": "OM", "Jordan": "JO", "Lebanon": "LB",
  "India": "IN", "Pakistan": "PK", "Sri Lanka": "LK", "Bangladesh": "BD", "Nepal": "NP",
  "Bhutan": "BT", "Maldives": "MV", "Australia": "AU", "New Zealand": "NZ", "Fiji": "FJ",
  "Papua New Guinea": "PG", "Samoa": "WS", "Tonga": "TO", "Vanuatu": "VU",
  "South Africa": "ZA", "Egypt": "EG", "Morocco": "MA", "Kenya": "KE", "Nigeria": "NG",
  "Ghana": "GH", "Tanzania": "TZ", "Uganda": "UG", "Rwanda": "RW", "Ethiopia": "ET",
  "China": "CN", "Japan": "JP", "South Korea": "KR", "Singapore": "SG", "Hong Kong": "HK",
  "Taiwan": "TW", "Thailand": "TH", "Vietnam": "VN", "Indonesia": "ID", "Malaysia": "MY",
  "Philippines": "PH", "Poland": "PL", "Romania": "RO", "Hungary": "HU", "Czechia": "CZ",
};

/** Flag image URL for an ISO 3166-1 alpha-2 (or flagcdn subdivision code like "gb-wls"). */
export function flagUrlByIso2(iso2) {
  return iso2 ? `https://flagcdn.com/w40/${iso2.toLowerCase()}.png` : null;
}

/** Flag image URL for a country name (flagcdn — emoji flags don't render on Windows). */
export function countryFlagUrl(country) {
  return flagUrlByIso2(COUNTRY_ISO2[country]);
}

/**
 * Map a country (full name like "Canada", or ISO alpha-2 like "CA") to its currency.
 * Returns null when unknown.
 */
export function currencyForCountry(country) {
  if (!country) return null;
  if (REGIONAL_CONFIG[country]) return REGIONAL_CONFIG[country].currency;
  const code = String(country).trim().toUpperCase();
  return ISO_CURRENCY[code] ?? null;
}

/** Geo-IP hint stored by the language prompt (full name preferred, then alpha-2). */
function geoDetectedCountry() {
  try {
    return (
      localStorage.getItem("strug_country_name") ||
      localStorage.getItem("strug_country") ||
      null
    );
  } catch {
    return null;
  }
}

export function getRegionData(country) {
  // Per-country TAX rate always comes from the table. The DISPLAY currency follows the
  // user's country when we can format/convert it, otherwise falls back to the base (CAD).
  const base = REGIONAL_CONFIG[country] ?? REGIONAL_CONFIG["default"];
  const cur = currencyForCountry(country);
  const currency = cur && DISPLAYABLE_CURRENCIES.has(cur) ? cur : BASE_CURRENCY;
  return { ...base, currency };
}

/**
 * The currency to DISPLAY prices in for the current user. This is display-only — every
 * checkout still charges in BASE_CURRENCY (CAD); conversion must never feed a charge amount.
 * Resolution order: currency for the profile country → currency for the geo-IP detected
 * country → CAD. We deliberately IGNORE the stored `user.currency`: it defaults to "CAD" at
 * the DB level and is never set by the app (display is country-driven), so reading it would
 * pin everyone to CAD. Only currencies we can convert AND format are accepted, so we never
 * render a garbage figure from a missing FX rate.
 */
export function resolveUserCurrency() {
  const user = getUser();
  const candidates = [
    currencyForCountry(user?.country),
    currencyForCountry(geoDetectedCountry()),
  ];
  for (const c of candidates) {
    if (c && DISPLAYABLE_CURRENCIES.has(c)) return c;
  }
  return BASE_CURRENCY;
}

export function getUserRegion() {
  const user = getUser();
  const base = getRegionData(user?.country);
  const currency = resolveUserCurrency();
  return { ...base, currency };
}

/** Convert amount between currencies using USD cross-rates. */
export function convertMoney(amount, fromCurrency, toCurrency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const from = fromCurrency || BASE_CURRENCY;
  const to = toCurrency || resolveUserCurrency();
  if (from === to) return n;
  const fromRate = EXCHANGE_RATES_FROM_USD[from] ?? 1;
  const toRate = EXCHANGE_RATES_FROM_USD[to] ?? 1;
  const usd = from === "USD" ? n : n / fromRate;
  return to === "USD" ? usd : usd * toRate;
}

export function fmt(amount, currency, locale) {
  const loc = locale || i18n.language || "en";
  const cur = currency || resolveUserCurrency() || "USD";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const zeroDec = ZERO_DECIMAL_CURRENCIES.has(cur);
  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: zeroDec ? 0 : 2,
      maximumFractionDigits: zeroDec ? 0 : 2,
    }).format(n);
  } catch {
    return `${n.toFixed(zeroDec ? 0 : 2)} ${cur}`;
  }
}

/**
 * Convert from API/base currency and format for display.
 * @param {number} amount — price in `fromCurrency` (default USD)
 * @param {{ fromCurrency?: string, currency?: string, locale?: string }} [opts]
 */
export function fmtMoney(amount, opts = {}) {
  const from = opts.fromCurrency ?? BASE_CURRENCY;
  const to = opts.currency ?? resolveUserCurrency();
  const locale = opts.locale ?? i18n.language ?? "en";
  const converted = convertMoney(amount, from, to);
  return fmt(converted, to, locale);
}

/** Settlement-currency display for seller payouts. Never convert to local FX. */
export function fmtPayoutCad(amount) {
  const n = Number(amount);
  const v = Number.isFinite(n) ? n : 0;
  return `CAD ${v.toFixed(2)}`;
}

// ── Live exchange rates ──────────────────────────────────────────────────────
// Display-only: live rates refine the FIGURE shown to the user, never a charge amount
// (every checkout settles in CAD). open.er-api.com is a keyless USD-based feed (~160
// currencies, incl. LKR/PKR/INR). We overlay live values onto the static map for the
// currencies we already know about, cache them, and tolerate failure (keep static/cached).
const FX_CACHE_KEY = "strug_fx_rates";
const FX_TTL_MS = 12 * 60 * 60 * 1000; // refetch at most twice a day
const FX_ENDPOINT = "https://open.er-api.com/v6/latest/USD";

/** Overlay live rates onto known currencies only (keeps DISPLAYABLE_CURRENCIES valid). */
function mergeKnownRates(rates) {
  if (!rates) return;
  for (const code of Object.keys(EXCHANGE_RATES_FROM_USD)) {
    const v = Number(rates[code]);
    if (Number.isFinite(v) && v > 0) EXCHANGE_RATES_FROM_USD[code] = v;
  }
}

// Apply last-known live rates synchronously at module load, so the first paint already
// uses fresh figures (not the ship-time approximations) on repeat visits.
(function applyCachedFx() {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null");
    if (cached?.rates) mergeKnownRates(cached.rates);
  } catch { /* ignore */ }
})();

/**
 * Fetch live USD-based rates and overlay them. No-ops if a cached set is still fresh
 * (unless `force`). Safe to call on every app start — it self-throttles via the cache.
 */
export async function refreshExchangeRates({ force = false } = {}) {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null");
    if (!force && cached?.ts && Date.now() - cached.ts < FX_TTL_MS) return; // still fresh
  } catch { /* ignore */ }
  try {
    const res = await fetch(FX_ENDPOINT);
    if (!res.ok) return;
    const data = await res.json();
    if (data?.result === "success" && Number(data?.rates?.USD) === 1) {
      mergeKnownRates(data.rates);
      try {
        localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: data.rates }));
      } catch { /* quota — non-fatal */ }
    }
  } catch { /* offline / blocked — keep static + cached rates */ }
}
