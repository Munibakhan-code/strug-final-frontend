import { describe, it, expect, beforeEach } from 'vitest';
import { setToken, setUser, getToken, getUser, clearAuth } from './auth.js';
import {
  listSavedAccounts,
  upsertSavedAccount,
  rememberActiveAccount,
  removeSavedAccount,
  clearSavedAccounts,
  getSavedAccount,
  isAccessTokenExpired,
  applySavedAccountSession,
  MAX_SAVED_ACCOUNTS,
} from './savedAccounts.js';

function jwtWithExp(expSec, userId = 1) {
  const payload = btoa(JSON.stringify({ exp: expSec, user_id: userId }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `x.${payload}.y`;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('savedAccounts vault', () => {
  it('upserts and lists accounts newest-first', () => {
    upsertSavedAccount({ user_id: 1, name: 'A', email: 'a@x.com' }, 'tok-a');
    upsertSavedAccount({ user_id: 2, name: 'B', email: 'b@x.com' }, 'tok-b');
    const list = listSavedAccounts();
    expect(list.map((a) => a.userId)).toEqual([2, 1]);
    expect(list[0].email).toBe('b@x.com');
  });

  it('replaces the same userId instead of duplicating', () => {
    upsertSavedAccount({ user_id: 1, name: 'A' }, 't1');
    upsertSavedAccount({ user_id: 1, name: 'A2', profile_pic_url: 'p.png' }, 't2');
    const list = listSavedAccounts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('A2');
    expect(list[0].accessToken).toBe('t2');
    expect(list[0].profile_pic_url).toBe('p.png');
  });

  it('caps the roster at MAX_SAVED_ACCOUNTS', () => {
    for (let i = 0; i < MAX_SAVED_ACCOUNTS + 3; i++) {
      upsertSavedAccount({ user_id: i, name: `U${i}` }, `t${i}`);
    }
    expect(listSavedAccounts()).toHaveLength(MAX_SAVED_ACCOUNTS);
    expect(listSavedAccounts()[0].userId).toBe(MAX_SAVED_ACCOUNTS + 2);
  });

  it('rememberActiveAccount snapshots the live session', () => {
    setToken('live');
    setUser({ user_id: 9, name: 'Live' });
    rememberActiveAccount();
    expect(getSavedAccount(9)?.accessToken).toBe('live');
  });

  it('keeps profile and onboarding metadata for added existing accounts', () => {
    upsertSavedAccount({
      user_id: 9,
      profile_id: 19,
      name: 'Existing',
      social_created_at: '2026-01-01T00:00:00.000Z',
      has_seen_welcome: true,
      is_seller: true,
      is_driver: true,
    }, 'tok-existing');

    const saved = getSavedAccount(9);
    expect(saved.profile_id).toBe(19);
    expect(saved.social_created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(saved.has_seen_welcome).toBe(true);
    expect(saved.is_seller).toBe(true);

    expect(applySavedAccountSession(saved)).toBe(true);
    expect(getUser()).toMatchObject({
      user_id: 9,
      profile_id: 19,
      social_created_at: '2026-01-01T00:00:00.000Z',
      has_seen_welcome: true,
      is_seller: true,
      is_driver: true,
    });
  });

  it('clearAuth does not wipe the vault', () => {
    upsertSavedAccount({ user_id: 1, name: 'A' }, 't');
    setToken('t');
    setUser({ user_id: 1 });
    clearAuth();
    expect(listSavedAccounts()).toHaveLength(1);
  });

  it('removeSavedAccount and clearSavedAccounts', () => {
    upsertSavedAccount({ user_id: 1 }, 'a');
    upsertSavedAccount({ user_id: 2 }, 'b');
    removeSavedAccount(1);
    expect(listSavedAccounts().map((a) => a.userId)).toEqual([2]);
    clearSavedAccounts();
    expect(listSavedAccounts()).toEqual([]);
  });

  it('isAccessTokenExpired respects JWT exp', () => {
    expect(isAccessTokenExpired(jwtWithExp(1))).toBe(true);
    expect(isAccessTokenExpired(jwtWithExp(Math.floor(Date.now() / 1000) + 3600))).toBe(false);
  });

  it('applySavedAccountSession activates token + user and wipes prior per-user cache', () => {
    setUser({ user_id: 1 });
    localStorage.setItem('strug_wallet_balance', '99');
    const ok = applySavedAccountSession({
      userId: 2,
      name: 'B',
      email: 'b@x.com',
      accessToken: 'tok-b',
    });
    expect(ok).toBe(true);
    expect(getToken()).toBe('tok-b');
    expect(getUser()?.user_id).toBe(2);
    expect(localStorage.getItem('strug_wallet_balance')).toBeNull();
  });
});
