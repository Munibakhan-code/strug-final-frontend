import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// PERF (bug #35): only English ships in the boot bundle. The other 56 locale JSON files
// (~650KB combined) were previously imported statically, dragging the whole set onto the
// initial critical path that every page waits on — even though >99% of sessions are English
// and the non-English files are near-identical English stubs. The rest are now lazy-loaded
// on demand via loadLanguage() the first time a user selects (or boots into) that language.
import en from "./locales/en.json";

export const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps"]);

export const LANGUAGES = [
  { code: "af", english: "Afrikaans",     native: "Afrikaans" },
  { code: "ar", english: "Arabic",        native: "العربية" },
  { code: "az", english: "Azerbaijani",   native: "Azərbaycan dili" },
  { code: "bn", english: "Bengali",       native: "বাংলা" },
  { code: "bs", english: "Bosnian",       native: "Bosanski" },
  { code: "bg", english: "Bulgarian",     native: "Български" },
  { code: "ca", english: "Catalan",       native: "Català" },
  { code: "cs", english: "Czech",         native: "Čeština" },
  { code: "da", english: "Danish",        native: "Dansk" },
  { code: "nl", english: "Dutch",         native: "Nederlands" },
  { code: "en", english: "English",       native: "English" },
  { code: "et", english: "Estonian",      native: "Eesti" },
  { code: "tl", english: "Filipino",      native: "Filipino" },
  { code: "fi", english: "Finnish",       native: "Suomi" },
  { code: "fr", english: "French",        native: "Français" },
  { code: "ka", english: "Georgian",      native: "ქართული" },
  { code: "de", english: "German",        native: "Deutsch" },
  { code: "el", english: "Greek",         native: "Ελληνικά" },
  { code: "gu", english: "Gujarati",      native: "ગુજરાતી" },
  { code: "ha", english: "Hausa",         native: "Hausa" },
  { code: "he", english: "Hebrew",        native: "עברית" },
  { code: "hi", english: "Hindi",         native: "हिन्दी" },
  { code: "hu", english: "Hungarian",     native: "Magyar" },
  { code: "is", english: "Icelandic",     native: "Íslenska" },
  { code: "ga", english: "Irish",         native: "Gaeilge" },
  { code: "it", english: "Italian",       native: "Italiano" },
  { code: "ja", english: "Japanese",      native: "日本語" },
  { code: "kk", english: "Kazakh",        native: "Қазақ тілі" },
  { code: "ko", english: "Korean",        native: "한국어" },
  { code: "lv", english: "Latvian",       native: "Latviešu" },
  { code: "ln", english: "Lingala",       native: "Lingála" },
  { code: "lt", english: "Lithuanian",    native: "Lietuvių" },
  { code: "lb", english: "Luxembourgish", native: "Lëtzebuergesch" },
  { code: "mk", english: "Macedonian",    native: "Македонски" },
  { code: "ms", english: "Malay",         native: "Bahasa Melayu" },
  { code: "zh", english: "Mandarin",      native: "普通话" },
  { code: "ne", english: "Nepali",        native: "नेपाली" },
  { code: "no", english: "Norwegian",     native: "Norsk" },
  { code: "ps", english: "Pashto",        native: "پښتو" },
  { code: "fa", english: "Persian",       native: "فارسی" },
  { code: "pl", english: "Polish",        native: "Polski" },
  { code: "pt", english: "Portuguese",    native: "Português" },
  { code: "ro", english: "Romanian",      native: "Română" },
  { code: "ru", english: "Russian",       native: "Русский" },
  { code: "sr", english: "Serbian",       native: "Srpski / Српски" },
  { code: "sk", english: "Slovak",        native: "Slovenčina" },
  { code: "sl", english: "Slovenian",     native: "Slovenščina" },
  { code: "so", english: "Somali",        native: "Soomaali" },
  { code: "es", english: "Spanish",       native: "Español" },
  { code: "sw", english: "Swahili",       native: "Kiswahili" },
  { code: "sv", english: "Swedish",       native: "Svenska" },
  { code: "ta", english: "Tamil",         native: "தமிழ்" },
  { code: "th", english: "Thai",          native: "ไทย" },
  { code: "tr", english: "Turkish",       native: "Türkçe" },
  { code: "ur", english: "Urdu",          native: "اردو" },
  { code: "vi", english: "Vietnamese",    native: "Tiếng Việt" },
  { code: "cy", english: "Welsh",         native: "Cymraeg" },
];

/**
 * Language code → the country flag conventionally used for it in language pickers.
 * A language isn't a country, so these are best-effort "most-associated" choices
 * (e.g. English→GB, Arabic→SA, Spanish→ES, Welsh→gb-wls subdivision flag).
 */
export const LANGUAGE_FLAG_ISO2 = {
  af: "za", ar: "sa", az: "az", bn: "bd", bs: "ba", bg: "bg", ca: "es", cs: "cz",
  da: "dk", nl: "nl", en: "gb", et: "ee", tl: "ph", fi: "fi", fr: "fr", ka: "ge",
  de: "de", el: "gr", gu: "in", ha: "ng", he: "il", hi: "in", hu: "hu", is: "is",
  ga: "ie", it: "it", ja: "jp", kk: "kz", ko: "kr", lv: "lv", ln: "cd", lt: "lt",
  lb: "lu", mk: "mk", ms: "my", zh: "cn", ne: "np", no: "no", ps: "af", fa: "ir",
  pl: "pl", pt: "pt", ro: "ro", ru: "ru", sr: "rs", sk: "sk", sl: "si", so: "so",
  es: "es", sw: "ke", sv: "se", ta: "in", th: "th", tr: "tr", ur: "pk", vi: "vn",
  cy: "gb-wls",
};

// Only English is bundled up front; everything else loads on demand (see loadLanguage).
const resources = {
  en: { translation: en },
};

const SUPPORTED = new Set(LANGUAGES.map((l) => l.code));

// Lazy-load a locale bundle the first time it's needed. Vite emits each ./locales/*.json
// as its own chunk for this dynamic import, so non-English JSON stays off the boot path.
export async function loadLanguage(code) {
  const base = (code || "").split("-")[0];
  if (!base || base === "en" || !SUPPORTED.has(base)) return;
  if (i18n.hasResourceBundle(base, "translation")) return;
  try {
    const mod = await import(`./locales/${base}.json`);
    i18n.addResourceBundle(base, "translation", mod.default ?? mod, true, true);
  } catch {
    /* missing/failed locale → English fallback already applies */
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    defaultNS: "translation",
    load: "languageOnly", // treat navigator "fr-FR" as "fr" so the right chunk resolves
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "strug_language",
    },
  });

const STRIPE_LOCALES = new Set([
  "auto", "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "he", "hu",
  "id", "it", "ja", "ko", "lt", "lv", "ms", "mt", "nb", "nl", "pl", "pt", "ro", "ru",
  "sk", "sl", "sv", "th", "tr", "vi", "zh", "zh-TW",
]);

/** Map i18n language code to a Stripe Elements supported locale (fallback: en). */
export function stripeLocaleFromI18n(lng) {
  if (!lng) return "en";
  if (STRIPE_LOCALES.has(lng)) return lng;
  const base = lng.split("-")[0];
  return STRIPE_LOCALES.has(base) ? base : "en";
}

// Make every existing changeLanguage() call site (language picker, Account, userLanguage
// helper) fetch the locale chunk before switching — no call-site changes needed.
const _origChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (code, ...rest) => {
  await loadLanguage(code ?? i18n.language);
  return _origChangeLanguage(code, ...rest);
};

// Boot: if the detected/stored language is non-English, fetch its chunk and re-apply so the
// user sees their language instead of an English flash that never resolves.
const _booted = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
if (_booted !== "en") {
  loadLanguage(_booted).then(() => _origChangeLanguage(_booted));
}

export default i18n;
