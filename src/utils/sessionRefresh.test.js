import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import {
  accessTokenNeedsRefresh,
  ensureValidAccessToken,
  REFRESH_AHEAD_MS,
} from './sessionRefresh.js';
import { setToken, setUser, setSessionOwner, getToken } from '../store/auth.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function tokenWithExp(expSec, userId = 7) {
  const payload = btoa(JSON.stringify({ exp: expSec, user_id: userId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `x.${payload}.y`;
}

describe('accessTokenNeedsRefresh', () => {
  it('is false when access JWT exp is comfortably in the future', () => {
    setToken(tokenWithExp(Math.floor(Date.now() / 1000) + 3600));
    expect(accessTokenNeedsRefresh()).toBe(false);
  });

  it('is true when access JWT exp is in the past', () => {
    setToken(tokenWithExp(1));
    expect(accessTokenNeedsRefresh()).toBe(true);
  });

  it('is true when exp is inside the refresh-ahead window', () => {
    const expSec = Math.floor((Date.now() + REFRESH_AHEAD_MS - 1000) / 1000);
    setToken(tokenWithExp(expSec));
    expect(accessTokenNeedsRefresh()).toBe(true);
  });

  it('is true when token missing but session owner exists', () => {
    setSessionOwner({ user_id: 7 });
    expect(accessTokenNeedsRefresh(0)).toBe(true);
  });
});

describe('ensureValidAccessToken', () => {
  it('returns current token without calling refresh when still valid', async () => {
    setToken(tokenWithExp(Math.floor(Date.now() / 1000) + 3600));
    let refreshCount = 0;
    server.use(
      http.post('*/auth/refresh', () => {
        refreshCount += 1;
        return HttpResponse.json({ accessToken: 'new' });
      }),
    );
    const token = await ensureValidAccessToken();
    expect(token).toBe(getToken());
    expect(refreshCount).toBe(0);
  });

  it('refreshes when access JWT is expired but session signals exist', async () => {
    setToken(tokenWithExp(1));
    setUser({ user_id: 7 });
    setSessionOwner({ user_id: 7 });
    server.use(
      http.post('*/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'renewed', user: { user_id: 7 } }),
      ),
    );
    const token = await ensureValidAccessToken();
    expect(token).toBe('renewed');
    expect(getToken()).toBe('renewed');
  });

  it('returns null for guests with no session signals', async () => {
    let refreshCount = 0;
    server.use(
      http.post('*/auth/refresh', () => {
        refreshCount += 1;
        return HttpResponse.json({ accessToken: 'x' });
      }),
    );
    expect(await ensureValidAccessToken()).toBeNull();
    expect(refreshCount).toBe(0);
  });
});
