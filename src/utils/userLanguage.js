import i18n from '../i18n/index.js';
import { updateUser } from '../api/user.js';
import { getUser, setUser } from '../store/auth.js';

export function getStoredLanguage() {
  return localStorage.getItem('strug_language') || 'en';
}

/** UI + localStorage + backend user.language (for localized emails). */
export async function applyUserLanguage(code) {
  if (!code) return;
  await i18n.changeLanguage(code);
  localStorage.setItem('strug_language', code);

  const uid = getUser()?.user_id;
  if (!uid) return;

  try {
    await updateUser(uid, { language: code });
    setUser({ ...getUser(), language: code });
  } catch (err) {
    console.warn('Failed to save language to account:', err?.response?.data?.message || err?.message);
  }
}

/** Push localStorage language to server when DB is missing or stale. */
export async function syncLanguageToServer(user) {
  const stored = getStoredLanguage();
  const uid = user?.user_id ?? getUser()?.user_id;
  if (!uid || !stored) return stored;

  if (user?.language === stored) return stored;

  try {
    await updateUser(uid, { language: stored });
    const current = getUser() || user;
    setUser({ ...current, language: stored });
    return stored;
  } catch (err) {
    console.warn('Failed to sync language to account:', err?.response?.data?.message || err?.message);
    return user?.language || stored;
  }
}

/** After login/register — align UI with server; backfill DB from localStorage if needed. */
export async function syncLanguageFromUser(user) {
  const stored = getStoredLanguage();
  let code = user?.language || stored || 'en';

  if (user?.user_id && stored && stored !== user?.language) {
    code = await syncLanguageToServer(user);
  }

  await i18n.changeLanguage(code);
  localStorage.setItem('strug_language', code);
}
