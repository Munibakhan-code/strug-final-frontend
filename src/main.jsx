import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { getToken } from './store/auth'
import { refreshAccessToken } from './api/client'
import { installDiagnostics } from './utils/diagnostics'
import { initObservability } from './utils/observability'
import { isLocalDevLoginEnabled } from './utils/devLogin'
import { installMobilePlayback } from './utils/mobilePlayback'

const disposeMobilePlayback = installMobilePlayback()
if (import.meta.hot) import.meta.hot.dispose(disposeMobilePlayback)

// Remote crash reporting, before anything else can throw. Complements installDiagnostics()
// below: that keeps a local ring buffer a user can attach to a bug report, this reports
// automatically so a crash nobody files still reaches us. Inert without VITE_SENTRY_DSN.
initObservability()

// Start recording console errors + failed API calls into a small ring buffer, so a bug report
// filed later can carry what the app knew when it broke. Installed FIRST, before anything else
// can throw — an error during boot is exactly the kind we most want attached. It only observes:
// the original console methods are always called. See utils/diagnostics.js for what is (and is
// very deliberately not) captured.
installDiagnostics()

// Kick off the silent session restore BEFORE React mounts. React runs a page's data-fetch effects
// before the App's own bootstrap effect, so on a hard load / new tab (sessionStorage has no access
// token, but the httpOnly refresh cookie is still valid) an authed page would fire its requests
// before the cookie→token exchange finishes — they'd go out with no Authorization header and 401
// into an empty state. Starting the refresh here means it's already in flight when those requests
// fire; the api client's request interceptor awaits it (client.js). Single-flight, so App bootAuth
// reuses this same call. A genuine guest just gets one refresh that resolves to null, as before.
//
// Skip when the URL carries a login redirect `?token=` — otherwise an in-flight refresh for a
// previous account can finish after bootAuth applies the new token and wipe that session.
const hasLoginRedirectToken = (() => {
  try {
    const t = new URLSearchParams(window.location.search).get('token');
    return !!(t && t !== 'undefined');
  } catch {
    return false;
  }
})();
if (!getToken() && !isLocalDevLoginEnabled() && !hasLoginRedirectToken) {
  refreshAccessToken();
}

// Register the service worker unconditionally, not just when a user opts into push
// notifications (src/api/push.js) — Chrome only offers the PWA install prompt on pages
// with an active service worker registration, so gating it behind push opt-in meant most
// visitors never got the install prompt at all.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Drop the one-shot cache-buster that lazyWithRetry adds when it has to re-fetch a fresh
// index.html after a dead chunk (App.jsx). The fresh document is already loaded by now, so
// the param has done its job — strip it before anything reads the URL, so route resolution
// and the address bar never see it.
if (new URLSearchParams(window.location.search).has('_cb')) {
  const url = new URL(window.location.href);
  url.searchParams.delete('_cb');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
