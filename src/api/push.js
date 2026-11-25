// #193 Web Push (VAPID) client. Registers the service worker, manages the
// browser's PushSubscription, and syncs category preferences with the backend.
//
// This complements the existing foreground Notification API (useChatPush): this
// path delivers notifications even when the app tab is closed.

import client from './client';

const SW_URL = '/sw.js';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission() {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

// VAPID public keys are base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

let swRegistration = null;

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  if (swRegistration) return swRegistration;
  swRegistration = await navigator.serviceWorker.register(SW_URL);
  return swRegistration;
}

async function fetchVapidKey() {
  const { data } = await client.get('/push/vapid-public-key');
  if (!data?.enabled || !data?.key) return null;
  return data.key;
}

// Subscribe this browser to push. Requests permission (must be called from a user
// gesture the first time). Returns true on success, false if unsupported/denied.
export async function subscribeToPush(categories) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const registration = await registerServiceWorker();
  if (!registration) return { ok: false, reason: 'no-sw' };

  const vapidKey = await fetchVapidKey();
  if (!vapidKey) return { ok: false, reason: 'push-disabled' };

  // Reuse an existing subscription if present; otherwise create one.
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  }

  await client.post('/push/subscribe', {
    subscription: subscription.toJSON(),
    ...(categories ? { categories } : {}),
  });
  return { ok: true };
}

// Remove this browser's subscription (both locally and on the server).
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return { ok: false };
  const registration = await registerServiceWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});
    await client.post('/push/unsubscribe', { endpoint }).catch(() => {});
  }
  return { ok: true };
}

export async function isSubscribed() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const registration = await registerServiceWorker();
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

export async function getPushPreferences() {
  const { data } = await client.get('/push/preferences');
  try {
    if (data?.categories) localStorage.setItem('strug_push_prefs_cache', JSON.stringify({ categories: data.categories }));
  } catch { /* noop */ }
  return data;
}

export async function updatePushPreferences(categories) {
  const { data } = await client.put('/push/preferences', { categories });
  try {
    localStorage.setItem('strug_push_prefs_cache', JSON.stringify({ categories }));
  } catch { /* noop */ }
  return data;
}

// Called once on app load: if the user already granted permission in a prior
// session, silently re-register the SW and refresh the server subscription so
// pushes keep flowing across browser/key rotations. No-op if not yet granted.
export async function initWebPush() {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    await subscribeToPush();
  } catch {
    /* fail silently — push is best-effort */
  }
}
