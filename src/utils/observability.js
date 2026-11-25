// Browser crash reporting.
//
// The app shipped two `ReferenceError`s on routed pages — `CardElement` in Raise.jsx (which
// killed card donations) and `DIGPROD_CATS` in DigitalProducts.jsx (which blanked the page) —
// and nobody found out, because a crash in a user's browser produced exactly no signal
// anywhere. ErrorBoundary rendered its fallback and the stack went to a console no one reads.
//
// Two hard rules, same as the server side:
//   1. Absent VITE_SENTRY_DSN this module is completely inert — no init, no network, no
//      behaviour change. That keeps dev and the 1,449-test suite exactly as they were.
//   2. It never throws. A reporting failure must not become a second crash.
//
// This sits alongside utils/diagnostics.js, which keeps a local ring buffer for attaching to a
// user-filed bug report. That is opt-in and user-driven; this is automatic and remote.
import * as Sentry from '@sentry/react';

let enabled = false;

export function isObservabilityEnabled() {
  return enabled;
}

// Anything matching these keys is replaced before an event leaves the browser.
const SCRUB_KEYS = new Set([
  'authorization', 'cookie', 'password', 'new_password', 'old_password',
  'token', 'access_token', 'refresh_token', 'client_secret', 'secret',
  'otp', 'otp_code', 'card', 'card_number', 'cvv', 'cvc', 'pin', 'email', 'phone',
]);

function scrub(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SCRUB_KEYS.has(k.toLowerCase()) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

// A URL can carry a session handoff token (?token=…) or a reset code. Strip every query value
// rather than allow-listing, since new params get added over time and a leak is one-way.
function scrubUrl(raw) {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[redacted]');
    return url.toString();
  } catch {
    return raw;
  }
}

/** Errors that are noise, not defects: a user going offline, or a stale chunk after a deploy. */
function isIgnorable(event) {
  const value = event?.exception?.values?.[0]?.value || '';
  return (
    /Failed to fetch dynamically imported module/i.test(value) ||
    /Loading (CSS )?chunk .* failed/i.test(value) ||
    /NetworkError when attempting to fetch/i.test(value) ||
    /ResizeObserver loop (limit exceeded|completed)/i.test(value)
  );
}

/** Initialise crash reporting. Call once, as early in boot as possible. */
export function initObservability() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development',
      release: import.meta.env.VITE_APP_RELEASE || undefined,

      // Errors only by default; tracing and replay are separate cost decisions.
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
      sendDefaultPii: false,

      beforeSend(event) {
        try {
          if (isIgnorable(event)) return null;
          if (event.request?.url) event.request.url = scrubUrl(event.request.url);
          if (event.request?.headers) event.request.headers = scrub(event.request.headers);
          if (event.extra) event.extra = scrub(event.extra);
          // Identify by user id only — never email, handle, or IP.
          if (event.user) event.user = { id: event.user.id };
          return event;
        } catch {
          // Never send an event we could not fully scrub.
          return null;
        }
      },

      beforeBreadcrumb(crumb) {
        try {
          if (crumb?.data?.url) crumb.data.url = scrubUrl(crumb.data.url);
          // Console breadcrumbs can contain arbitrary interpolated user data.
          if (crumb?.category === 'console') return null;
          return crumb;
        } catch {
          return null;
        }
      },
    });

    enabled = true;
    return true;
  } catch {
    // Boot must survive a broken DSN or a blocked SDK.
    return false;
  }
}

/**
 * Attach the signed-in user's id so a crash can be traced to an account without carrying PII.
 * Safe to call before init and safe to call with null on sign-out.
 */
export function setObservabilityUser(userId) {
  if (!enabled) return;
  try {
    Sentry.setUser(userId == null ? null : { id: String(userId) });
  } catch { /* reporting must never break auth */ }
}

/**
 * Report an error. Safe to call unconditionally — a no-op when disabled, and never throws.
 * @param {unknown} error
 * @param {Record<string, unknown>} [context]
 */
export function captureError(error, context = {}) {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      scope.setExtras(scrub(context));
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  } catch { /* reporting must never break the caller */ }
}
