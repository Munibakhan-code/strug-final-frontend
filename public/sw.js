/* Strug Web Push service worker (#193).
 *
 * DELIBERATELY MINIMAL: this worker only handles background push + notification
 * clicks, plus a passthrough fetch handler required for PWA installability. It
 * performs NO caching, so it can never serve a stale index.html or otherwise
 * intercept navigation/asset requests. That keeps the SPA's normal
 * Cloudflare/Vite asset delivery completely untouched.
 */

self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  //  Video Playlists (.m3u8), Segments (.ts), Range requests  Azure Blobs 
  if (
    url.includes('.m3u8') ||
    url.includes('.ts') ||
    url.includes('blob.core.windows.net') ||
    event.request.headers.get('range')
  ) {
    return; // Service worker thread 
  }


  event.respondWith(fetch(event.request));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Strug', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Strug';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || undefined,
    // Collapse repeats with the same tag rather than stacking duplicates.
    renotify: Boolean(data.tag),
    data: { url: data.url || '/', ...(data.data || {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if the app is already open, and route it to the target.
      for (const client of clientList) {
        if ('focus' in client) {
          // Uploads belong to the live page: reloading it would abort the transfer.
          if (event.notification.data?.kind === 'video-upload-progress') {
            if (event.action === 'retry') client.postMessage({
              type: 'retry-video-upload', ids: event.notification.data.retryIds || [],
            });
            return client.focus();
          }
          client.focus();
          if ('navigate' in client && targetUrl) client.navigate(targetUrl).catch(() => {});
          return undefined;
        }
      }
      // Otherwise open a fresh tab.
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
