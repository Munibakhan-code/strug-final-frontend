// src/utils/diagnostics.js — what the app knew when a bug was filed.
//
// Board #462 ("comments disappear after posting") was closed on a theory, not a confirmation,
// because nobody could ask the reporter which account they were on, which page, or whether it
// survived a hard refresh. Every one of those questions is answerable from state the browser
// already had at submit time. This module keeps that state in two small ring buffers and hands
// it to BugReportModal.
//
// ── Privacy contract ─────────────────────────────────────────────────────────────────────
// This data is attached to a bug report that the board can read. So:
//   • We NEVER capture request/response bodies, headers, cookies, or storage. Not truncated —
//     not captured at all. The only thing recorded about a failed request is
//     {method, path, status}.
//   • Query strings are stripped from every URL before it is stored. `?token=…` is how our own
//     tooling authenticates, so this is not hypothetical.
//   • Console text is redacted against JWT / Bearer / API-key / email / `secret=value` patterns
//     and truncated.
//   • The user is SHOWN exactly what is attached before they submit (BugReportModal renders
//     this buffer). Consent here is informed, not assumed.
// The server re-applies all of this in utils/bug-report-context.js — the client is not a trust
// boundary. This layer exists so we don't ship secrets over the wire in the first place.

const MAX_CONSOLE = 5;
const MAX_API = 5;
const MAX_MESSAGE_CHARS = 300;

// Mirrors SECRET_PATTERNS in the backend's utils/bug-report-context.js. Both sides redact.
const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, // JWT
  /\bBearer\s+[\w.\-+/=]{8,}/gi,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // email addresses
  /\b(?:token|password|passwd|secret|api[_-]?key|auth|session)\b\s*[=:]\s*\S+/gi,
];

export function redact(input) {
  let s = String(input ?? '');
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[redacted]');
  return s;
}

// Keep origin + path, drop query + fragment.
function cleanUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const cut = s.search(/[?#]/);
  return cut === -1 ? s : s.slice(0, cut);
}

function truncate(s, max = MAX_MESSAGE_CHARS) {
  const t = String(s ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// ── ring buffers ──────────────────────────────────────────────────────────────────────────
const consoleBuf = [];
const apiBuf = [];
const SESSION_START = Date.now();

function push(buf, entry, max) {
  buf.push(entry);
  while (buf.length > max) buf.shift();
}

/** Record a console error / warning / uncaught rejection. */
export function recordConsole(level, message) {
  const clean = truncate(redact(message));
  if (!clean) return;
  push(consoleBuf, { level, message: clean, at: new Date().toISOString() }, MAX_CONSOLE);
}

/**
 * Record a FAILED API call. Method + path + status only — never the body, never the headers.
 * `status` is 0 when the request never got a response (network error / timeout), which is
 * itself diagnostic ("the API was unreachable" vs "the API said no").
 */
export function recordApiFailure({ method, url, status }) {
  const path = cleanUrl(url);
  if (!path) return;
  push(
    apiBuf,
    {
      method: String(method || 'GET').toUpperCase(),
      path: path.slice(0, 200),
      status: Number.isInteger(status) ? status : 0,
      at: new Date().toISOString(),
    },
    MAX_API,
  );
}

// ── install ───────────────────────────────────────────────────────────────────────────────
let installed = false;

/**
 * Patch console.error/warn and the global error handlers so the ring buffer fills passively.
 * The original console methods are always called — this observes, it never swallows. (A silent
 * catch around an API call is exactly how the #462-adjacent bugs stayed invisible for months.)
 */
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  for (const level of ['error', 'warn']) {
    const original = console[level];
    console[level] = (...args) => {
      try {
        recordConsole(level, args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'object' ? safeStringify(a) : String(a))).join(' '));
      } catch {
        // Never let diagnostics break the app's own logging.
      }
      original.apply(console, args);
    };
  }

  window.addEventListener('error', (e) => {
    recordConsole('window.onerror', e?.message || String(e?.error || 'Uncaught error'));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    recordConsole('unhandledrejection', r instanceof Error ? `${r.name}: ${r.message}` : String(r));
  });
}

// Objects logged to the console are frequently circular (React fibers, axios configs). Don't
// let that throw inside the console patch.
function safeStringify(o) {
  try {
    return JSON.stringify(o)?.slice(0, MAX_MESSAGE_CHARS) ?? String(o);
  } catch {
    return '[object]';
  }
}

// ── collect ───────────────────────────────────────────────────────────────────────────────
function deviceType() {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Build the blob attached to a bug report. Shape must match the backend's allow-list in
 * utils/bug-report-context.js — anything not modelled there is dropped server-side.
 *
 * @param {{ navId?: string, user?: object|null }} opts
 */
export function collectDiagnostics({ navId, user } = {}) {
  if (typeof window === 'undefined') return null;

  const userId = user?.user_id ?? user?.id ?? null;

  return {
    // Which frontend build produced this? Without it, "cannot reproduce" is unfalsifiable —
    // the reporter may simply be on a stale bundle.
    build_sha: import.meta.env.VITE_BUILD_SHA || undefined,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    device_type: deviceType(),
    nav_id: navId || undefined,
    console: [...consoleBuf],
    api: [...apiBuf],
    session: {
      authenticated: !!user,
      // Guard the null explicitly: Number(null) is 0, which would report every guest as user 0.
      user_id: userId != null && Number.isFinite(Number(userId)) ? Number(userId) : null,
      locale: typeof navigator !== 'undefined' ? navigator.language : null,
      timezone: Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? null,
      // Fresh load vs a tab that's been open for hours — distinguishes "broken on load" from
      // "broke after I'd been using it a while" without having to ask.
      session_age_s: Math.round((Date.now() - SESSION_START) / 1000),
    },
  };
}

/** For the modal's "here's exactly what we're attaching" disclosure. */
export function diagnosticsSummary() {
  return { consoleCount: consoleBuf.length, apiCount: apiBuf.length };
}
