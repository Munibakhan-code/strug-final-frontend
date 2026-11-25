export const INSTALL_DISMISS_KEY = 'strug_install_prompt_dismissed_at';
export const INSTALL_DONE_KEY = 'strug_install_prompt_installed';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // re-offer once a day

export function isStandaloneDisplay() {
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch { /* ignore */ }
  // iOS Safari's PWA flag doesn't participate in the display-mode media query.
  if (window.navigator?.standalone) return true;
  return document.referrer?.startsWith('android-app://') ?? false;
}

export function isIOSDevice() {
  const ua = window.navigator?.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as "Macintosh" but exposes multi-touch, unlike a real Mac.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function isMobileDevice() {
  return isIOSDevice() || /Android/i.test(window.navigator?.userAgent || '');
}

export function hasSeenInstallSuccess() {
  try {
    return localStorage.getItem(INSTALL_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInstallSuccess() {
  try {
    localStorage.setItem(INSTALL_DONE_KEY, '1');
  } catch { /* ignore */ }
}

export function markInstallPromptDismissed(now) {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch { /* ignore */ }
}

export function isInstallPromptDismissedRecently(now) {
  try {
    const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY));
    if (!at) return false;
    return now - at < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Whether the mobile "install this app" banner is eligible to show right now. */
export function shouldOfferInstall(now) {
  if (!isMobileDevice()) return false;
  if (isStandaloneDisplay()) return false;
  if (hasSeenInstallSuccess()) return false;
  if (isInstallPromptDismissedRecently(now)) return false;
  return true;
}
