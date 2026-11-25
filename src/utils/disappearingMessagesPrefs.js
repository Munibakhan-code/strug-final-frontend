/**
 * Disappearing-messages UI is Coming soon. Legacy localStorage sometimes stored "Off"
 * which still rendered a sticky banner. Only real durations should show.
 * @param {unknown} value
 */
export function shouldShowDisappearingBanner(value) {
  if (value == null) return false;
  const raw = String(value).trim();
  if (!raw || /^off$/i.test(raw)) return false;
  return true;
}

/**
 * Clear legacy disappearing prefs from storage (feature not shipped).
 * @param {Storage} [storage]
 */
export function clearDisappearingPrefs(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!storage) return false;
  try {
    storage.removeItem("strug_disappearing");
    return true;
  } catch {
    return false;
  }
}
