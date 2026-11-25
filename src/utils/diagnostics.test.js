// The client half of bug-report capture. This buffer is attached to a report the board reads,
// so these tests exist to pin the privacy contract, not just the happy path.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  redact,
  recordConsole,
  recordApiFailure,
  collectDiagnostics,
  diagnosticsSummary,
} from './diagnostics.js';

// The buffers are module-level (one per tab, like the app). Drain them between tests by
// overflowing with entries we then ignore — the ring caps at 5.
function drain() {
  for (let i = 0; i < 6; i += 1) recordConsole('error', `drain-${i}`);
  for (let i = 0; i < 6; i += 1) recordApiFailure({ method: 'GET', url: `/drain-${i}`, status: 500 });
}

describe('redact', () => {
  it('strips JWTs, bearer tokens, API keys, emails and secret=value pairs', () => {
    expect(redact('token eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjd9.s1gnatur3here')).not.toContain('eyJhbGci');
    expect(redact('Bearer abcdef123456789')).not.toContain('abcdef123456789');
    expect(redact('sk_live_ABCDEF123456')).not.toContain('sk_live_ABCDEF123456');
    expect(redact('reporter bob@example.com')).not.toContain('bob@example.com');
    expect(redact('password=hunter2')).not.toContain('hunter2');
  });
});

describe('capture buffers', () => {
  beforeEach(() => drain());

  it('records a failed API call as method + path + status, with the query string stripped', () => {
    recordApiFailure({ method: 'post', url: '/social/comments?token=live-access-token', status: 500 });

    const { api } = collectDiagnostics({ navId: 'social', user: null });
    const call = api[api.length - 1];

    expect(call).toMatchObject({ method: 'POST', path: '/social/comments', status: 500 });
    // Never the body, never the headers, never the query.
    expect(Object.keys(call).sort()).toEqual(['at', 'method', 'path', 'status']);
    expect(JSON.stringify(api)).not.toContain('live-access-token');
  });

  it('records a network failure (no response) as status 0, which is itself diagnostic', () => {
    recordApiFailure({ method: 'GET', url: '/videos/feed', status: 0 });
    const { api } = collectDiagnostics({});
    expect(api[api.length - 1]).toMatchObject({ status: 0, path: '/videos/feed' });
  });

  it('redacts console text before it ever enters the buffer', () => {
    recordConsole('error', 'auth failed for Bearer abcdef123456789');
    const { console: entries } = collectDiagnostics({});
    expect(entries[entries.length - 1].message).not.toContain('abcdef123456789');
  });

  it('keeps only the last 5 of each — a long session cannot grow unbounded', () => {
    for (let i = 0; i < 12; i += 1) recordConsole('error', `boom ${i}`);
    for (let i = 0; i < 12; i += 1) recordApiFailure({ method: 'GET', url: `/x/${i}`, status: 500 });

    const { console: entries, api } = collectDiagnostics({});
    expect(entries).toHaveLength(5);
    expect(api).toHaveLength(5);
    expect(entries[4].message).toBe('boom 11'); // newest retained
    expect(diagnosticsSummary()).toEqual({ consoleCount: 5, apiCount: 5 });
  });
});

describe('collectDiagnostics', () => {
  beforeEach(() => drain());

  it('answers the questions triage would otherwise have to ask', () => {
    // "which account? which page? mobile or desktop? which build? a fresh load or an old tab?"
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);

    const ctx = collectDiagnostics({ navId: 'social', user: { user_id: 42 } });

    expect(ctx.nav_id).toBe('social');
    expect(ctx.viewport).toBe('390x844');
    expect(ctx.device_type).toBe('mobile');
    expect(ctx.session.authenticated).toBe(true);
    expect(ctx.session.user_id).toBe(42);
    expect(ctx.session.session_age_s).toBeGreaterThanOrEqual(0);
  });

  it('reports a guest as unauthenticated rather than inventing a user', () => {
    const ctx = collectDiagnostics({ navId: 'home', user: null });
    expect(ctx.session.authenticated).toBe(false);
    expect(ctx.session.user_id).toBeNull();
  });

  it('never emits storage, cookies, headers or request bodies', () => {
    recordConsole('error', 'something broke');
    recordApiFailure({ method: 'POST', url: '/social/comments', status: 500 });

    const serialised = JSON.stringify(collectDiagnostics({ navId: 'social', user: { user_id: 1 } }));

    for (const forbidden of ['cookie', 'localStorage', 'sessionStorage', 'authorization', 'headers', 'body']) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });
});
