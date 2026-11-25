import { describe, it, expect, beforeEach, vi } from 'vitest';

// The scrubbing here is the only thing standing between a crash report and a leaked session
// token, so it gets tested directly rather than trusted. The module must also stay completely
// inert without a DSN — dev, CI and the rest of this suite depend on that.

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  setUser: vi.fn(),
  withScope: vi.fn((fn) => fn({ setExtras: vi.fn(), setTag: vi.fn() })),
  captureException: vi.fn(),
}));

vi.mock('@sentry/react', () => sentryMock);

async function loadFresh(env = {}) {
  vi.resetModules();
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./observability.js');
}

describe('observability — disabled without a DSN', () => {
  beforeEach(() => vi.unstubAllEnvs());

  it('does not initialise when VITE_SENTRY_DSN is unset', async () => {
    const obs = await loadFresh({ VITE_SENTRY_DSN: '' });
    expect(obs.initObservability()).toBe(false);
    expect(obs.isObservabilityEnabled()).toBe(false);
    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it('captureError and setObservabilityUser are silent no-ops when disabled', async () => {
    const obs = await loadFresh({ VITE_SENTRY_DSN: '' });
    obs.initObservability();
    expect(() => obs.captureError(new Error('boom'), { a: 1 })).not.toThrow();
    expect(() => obs.setObservabilityUser(42)).not.toThrow();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    expect(sentryMock.setUser).not.toHaveBeenCalled();
  });
});

describe('observability — enabled', () => {
  const DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

  beforeEach(() => vi.unstubAllEnvs());

  it('initialises with PII disabled and no tracing by default', async () => {
    const obs = await loadFresh({ VITE_SENTRY_DSN: DSN });
    expect(obs.initObservability()).toBe(true);
    const config = sentryMock.init.mock.calls[0][0];
    expect(config.dsn).toBe(DSN);
    expect(config.sendDefaultPii).toBe(false);
    expect(config.tracesSampleRate).toBe(0);
  });

  it('identifies the user by id only', async () => {
    const obs = await loadFresh({ VITE_SENTRY_DSN: DSN });
    obs.initObservability();
    obs.setObservabilityUser(4242);
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: '4242' });
    obs.setObservabilityUser(null);
    expect(sentryMock.setUser).toHaveBeenLastCalledWith(null);
  });

  describe('beforeSend', () => {
    async function beforeSend() {
      const obs = await loadFresh({ VITE_SENTRY_DSN: DSN });
      obs.initObservability();
      return sentryMock.init.mock.calls[0][0].beforeSend;
    }

    it('redacts secret-bearing keys anywhere in extra', async () => {
      const send = await beforeSend();
      const event = send({
        extra: {
          access_token: 'eyJhbGciOi.secret.value',
          nested: { password: 'hunter2', otp_code: '1234', harmless: 'keep me' },
        },
      });
      expect(event.extra.access_token).toBe('[redacted]');
      expect(event.extra.nested.password).toBe('[redacted]');
      expect(event.extra.nested.otp_code).toBe('[redacted]');
      expect(event.extra.nested.harmless).toBe('keep me');
      expect(JSON.stringify(event)).not.toMatch(/hunter2|eyJhbGciOi/);
    });

    it('strips every query value from the URL — session handoff uses ?token=', async () => {
      const send = await beforeSend();
      const event = send({
        request: { url: 'https://strug.ca/raise?token=eyJreal.session.token&ref=abc' },
      });
      expect(event.request.url).not.toMatch(/eyJreal/);
      expect(event.request.url).toContain('token=%5Bredacted%5D');
      // The path is kept — that is the part worth knowing.
      expect(event.request.url).toContain('/raise');
    });

    it('redacts Authorization and Cookie headers', async () => {
      const send = await beforeSend();
      const event = send({
        request: { headers: { Authorization: 'Bearer abc.def.ghi', 'X-Trace': 'keep' } },
      });
      expect(event.request.headers.Authorization).toBe('[redacted]');
      expect(event.request.headers['X-Trace']).toBe('keep');
    });

    it('reduces the user object to an id', async () => {
      const send = await beforeSend();
      const event = send({ user: { id: 7, email: 'a@b.com', ip_address: '1.2.3.4' } });
      expect(event.user).toEqual({ id: 7 });
    });

    it('drops chunk-load and offline noise', async () => {
      const send = await beforeSend();
      const noise = [
        'Failed to fetch dynamically imported module: /assets/Videos-abc.js',
        'Loading chunk 42 failed',
        'NetworkError when attempting to fetch resource.',
        'ResizeObserver loop completed with undelivered notifications.',
      ];
      for (const value of noise) {
        expect(send({ exception: { values: [{ value }] } })).toBeNull();
      }
    });

    it('keeps a genuine ReferenceError — the class that shipped to production', async () => {
      const send = await beforeSend();
      const event = send({
        exception: { values: [{ type: 'ReferenceError', value: 'CardElement is not defined' }] },
      });
      expect(event).not.toBeNull();
    });

    it('drops the event rather than sending it when scrubbing throws', async () => {
      const send = await beforeSend();
      const hostile = { request: {} };
      Object.defineProperty(hostile.request, 'url', {
        get() { throw new Error('nope'); },
        enumerable: true,
      });
      expect(send(hostile)).toBeNull();
    });
  });

  describe('beforeBreadcrumb', () => {
    async function beforeBreadcrumb() {
      const obs = await loadFresh({ VITE_SENTRY_DSN: DSN });
      obs.initObservability();
      return sentryMock.init.mock.calls[0][0].beforeBreadcrumb;
    }

    it('drops console breadcrumbs, which can carry interpolated user data', async () => {
      const crumb = await beforeBreadcrumb();
      expect(crumb({ category: 'console', message: 'user a@b.com failed' })).toBeNull();
    });

    it('scrubs query values on fetch breadcrumbs', async () => {
      const crumb = await beforeBreadcrumb();
      const out = crumb({ category: 'fetch', data: { url: 'https://api.strug.ca/auth?token=abc' } });
      expect(out.data.url).not.toContain('abc');
    });
  });
});
