import i18n, { LANGUAGES } from '../i18n/index.js';
import { getUser, setUser, isAuthenticated } from '../store/auth';
// NOTE: `updateUser` is imported lazily inside persistLanguage() below.
// A static import here creates a module-init cycle
// (client.js → languagePrefs.js → api/user.js → client.js) that Rollup
// bundles into a temporal-dead-zone crash on first render. See PR fixing #905 TDZ.

export const LANG_STORAGE_KEY = 'strug_language';
export const LANG_PROMPT_KEY = 'strug_lang_prompt_seen';
export const LANG_EXPLICIT_KEY = 'strug_lang_explicit';
export const CURRENCY_STORAGE_KEY = 'strug_currency';
export const COUNTRY_STORAGE_KEY = 'strug_country';

export function getSupportedLanguageCode(code) {
  if (!code) return 'en';
  const base = String(code).split('-')[0].toLowerCase();
  return LANGUAGES.some((l) => l.code === base) ? base : 'en';
}

export function hasLanguagePreference() {
  try {
    return !!localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return false;
  }
}

export function hasExplicitLanguageChoice() {
  try {
    if (localStorage.getItem(LANG_EXPLICIT_KEY) === '1') return true;
  } catch { /* ignore */ }
  return !!getUser()?.language;
}

export function hasSeenLanguagePrompt() {
  try {
    return localStorage.getItem(LANG_PROMPT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLanguagePromptSeen() {
  try {
    localStorage.setItem(LANG_PROMPT_KEY, '1');
  } catch { /* ignore */ }
}

/** Store geo-detected currency/country hints (used until user profile overrides). */
export function applyLocaleHints({ currency, country, countryName } = {}) {
  try {
    if (currency) localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    if (country) localStorage.setItem(COUNTRY_STORAGE_KEY, country);
    if (countryName) localStorage.setItem('strug_country_name', countryName);
  } catch { /* ignore */ }
}

export function getStoredCurrency() {
  try {
    return localStorage.getItem(CURRENCY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredCountry() {
  try {
    return localStorage.getItem(COUNTRY_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Apply language locally and optionally persist to user profile. */
export async function applyLanguage(code, { persistRemote = true } = {}) {
  const lang = getSupportedLanguageCode(code);
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    localStorage.setItem(LANG_EXPLICIT_KEY, '1');
  } catch { /* ignore */ }

  if (persistRemote && isAuthenticated()) {
    const u = getUser();
    if (u?.user_id) {
      try {
        const { updateUser } = await import('../api/user');
        await updateUser(u.user_id, { language: lang });
        setUser({ ...u, language: lang });
      } catch { /* offline / guest — local only */ }
    }
  }
  return lang;
}

/** After login / refresh — apply profile language; backfill DB from localStorage if needed. */
export async function syncLanguageFromUser(user) {
  let stored;
  try {
    stored = localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (user?.user_id && stored && stored !== user?.language) {
    return applyLanguage(stored, { persistRemote: true });
  }
  if (user?.language) {
    return applyLanguage(user.language, { persistRemote: false });
  }
  return null;
}

/** Push localStorage language to server when DB is missing or stale. */
export async function syncLanguageToServer(user) {
  let stored;
  try {
    stored = localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    stored = null;
  }
  const uid = user?.user_id ?? getUser()?.user_id;
  if (!uid || !stored || user?.language === stored) return stored;
  await applyLanguage(stored, { persistRemote: true });
  return stored;
}

export function languageDisplayName(code) {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.native ?? lang?.english ?? code;
}
