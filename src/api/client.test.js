import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../test/server.js';
import client, { refreshAccessToken } from './client.js';
import { setToken, getToken, setUser, setSessionOwner } from '../store/auth.js';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

// A real signed-in session: an access token AND the cached user, plus the browser-wide record
// of who signed in here. (A token with no user is not a state the app treats as signed in —
// bootAuth clears it.) The refresh cookie itself is httpOnly, so it's implicit in these tests.
function signedIn(userId = 7) {
  setToken('old');
  setUser({ user_id: userId });
  setSessionOwner({ user_id: userId });
}

describe('api client — auth header', () => {
  it('injects the Bearer token from storage', async () => {
    setToken('tok-1');
    server.use(http.get('*/echo', ({ request }) =>
      HttpResponse.json({ auth: request.headers.get('authorization') })));
    const res = await client.get('/echo');
    expect(res.data.auth).toBe('Bearer tok-1');
  });

  it('sends no Authorization header when there is no token', async () => {
    server.use(http.get('*/echo', ({ request }) =>
      HttpResponse.json({ auth: request.headers.get('authorization') })));
    const res = await client.get('/echo');
    expect(res.data.auth).toBeNull();
  });
});

describe('api client — 401 → refresh → retry', () => {
  it('refreshes once and replays the original request with the new token', async () => {
    signedIn();
    let refreshCount = 0;
    server.use(
      http.post('*/auth/refresh', () => { refreshCount += 1; return HttpResponse.json({ accessToken: 'new' }); }),
      http.get('*/protected', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse('Unauthorized', { status: 401 })),
    );
    const res = await client.get('/protected');
    expect(res.data).toEqual({ ok: true });
    expect(getToken()).toBe('new');
    expect(refreshCount).toBe(1);
  });

  it('persists the refreshed user when the refresh response includes one', async () => {
    signedIn();
    server.use(
      http.post('*/auth/refresh', () => HttpResponse.json({ accessToken: 'new', user: { user_id: 7 } })),
      http.get('*/protected', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse('Unauthorized', { status: 401 })),
    );
    await client.get('/protected');
    expect(JSON.parse(sessionStorage.getItem('strug_user'))).toEqual({ user_id: 7 }); // setUser writes sessionStorage
  });

  it('single-flights concurrent 401s into a single refresh', async () => {
    signedIn();
    let refreshCount = 0;
    server.use(
      http.post('*/auth/refresh', async () => { refreshCount += 1; await delay(10); return HttpResponse.json({ accessToken: 'new' }); }),
      http.get('*/p', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse('Unauthorized', { status: 401 })),
    );
    const results = await Promise.all([client.get('/p'), client.get('/p'), client.get('/p')]);
    expect(results.every((r) => r.data.ok)).toBe(true);
    expect(refreshCount).toBe(1);
  });

  it('treats a 403 "Invalid token" as an auth error and refreshes', async () => {
    signedIn();
    let refreshCount = 0;
    server.use(
      http.post('*/auth/refresh', () => { refreshCount += 1; return HttpResponse.json({ accessToken: 'new' }); }),
      http.get('*/p', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ ok: true })
          : new HttpResponse('Invalid token', { status: 403 })),
    );
    const res = await client.get('/p');
    expect(res.data.ok).toBe(true);
    expect(refreshCount).toBe(1);
  });
});

// #414: the refresh cookie is httpOnly and browser-wide, so it outlives the tab and is even
// shared across environments (staging and prod both sit under the .strug.ca cookie domain).
// A new tab used to trade whatever cookie was lying around for a session and sign you in as
// its owner — the test user, or another account entirely. A restore must now prove it belongs
// to an account that actually signed in on THIS browser.
describe('api client — refresh cookie must belong to this browser (#414)', () => {
  const refreshReturns = (userId) =>
    server.use(
      http.post('*/auth/refresh', () => HttpResponse.json({ accessToken: 'new', user: { user_id: userId } })),
      http.delete('*/auth/delete_token', () => HttpResponse.json({ ok: true })),
    );

  it('does not adopt a session from a cookie this browser never signed in with', async () => {
    refreshReturns(7); // the leftover test-user cookie
    const token = await refreshAccessToken();
    expect(token).toBeNull();
    expect(getToken()).toBeNull();
    expect(sessionStorage.getItem('strug_user')).toBeNull();
  });

  it('revokes the foreign cookie so it cannot re-offer the same session next load', async () => {
    let revoked = 0;
    server.use(
      http.post('*/auth/refresh', () => HttpResponse.json({ accessToken: 'new', user: { user_id: 7 } })),
      http.delete('*/auth/delete_token', () => { revoked += 1; return HttpResponse.json({ ok: true }); }),
    );
    await refreshAccessToken();
    await vi.waitFor(() => expect(revoked).toBe(1));
  });

  it('refuses a cookie belonging to a DIFFERENT account than the one that signed in here', async () => {
    setSessionOwner({ user_id: 42 }); // account 42 signed in on this browser…
    refreshReturns(7);                // …but the cookie hands back account 7
    expect(await refreshAccessToken()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('restores the session on a new tab when the cookie DOES match the account that signed in here', async () => {
    setSessionOwner({ user_id: 42 }); // signed in earlier; sessionStorage is empty (new tab)
    refreshReturns(42);
    expect(await refreshAccessToken()).toBe('new');
    expect(getToken()).toBe('new');
    expect(JSON.parse(sessionStorage.getItem('strug_user'))).toEqual({ user_id: 42 });
  });
});

describe('api client — session expiry', () => {
  it('clears auth and emits strug:logout when refresh fails', async () => {
    signedIn();
    const onLogout = vi.fn();
    window.addEventListener('strug:logout', onLogout);
    server.use(
      http.post('*/auth/refresh', () => new HttpResponse('nope', { status: 401 })),
      http.get('*/protected', () => new HttpResponse('Unauthorized', { status: 401 })),
    );
    await expect(client.get('/protected')).rejects.toBeTruthy();
    expect(getToken()).toBeNull();
    expect(onLogout).toHaveBeenCalledTimes(1);
    window.removeEventListener('strug:logout', onLogout);
  });

  it('does not attempt a refresh for a guest 401 (no token sent)', async () => {
    let refreshCount = 0;
    server.use(
      http.post('*/auth/refresh', () => { refreshCount += 1; return HttpResponse.json({ accessToken: 'x' }); }),
      http.get('*/public', () => new HttpResponse('Unauthorized', { status: 401 })),
    );
    await expect(client.get('/public')).rejects.toBeTruthy();
    expect(refreshCount).toBe(0);
  });
});
