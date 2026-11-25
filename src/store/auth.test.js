import { describe, it, expect, beforeEach } from 'vitest';
import {
  getToken, setToken,
  getUser, setUser,
  clearPerUserState, clearAuth,
  isAuthenticated,
  getAuthUserId, userIdFromAccessToken,
  setSessionOwner,
  hasSessionSignals,
  accessTokenExpMs,
} from './auth.js';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('token + user storage', () => {
  it('round-trips the token', () => {
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(getToken()).toBe('abc');
  });
  it('round-trips the user as JSON', () => {
    setUser({ user_id: 1, name: 'A' });
    expect(getUser()).toEqual({ user_id: 1, name: 'A' });
  });
  it('getUser returns null on malformed JSON', () => {
    sessionStorage.setItem('strug_user', '{not json'); // getUser reads sessionStorage
    expect(getUser()).toBeNull();
  });
  it('isAuthenticated tracks the presence of a token', () => {
    expect(isAuthenticated()).toBe(false);
    setToken('t');
    expect(isAuthenticated()).toBe(true);
  });
  it('isAuthenticated is false when JWT exp is in the past', () => {
    // header.payload.sig — payload {"exp":1} base64url
    const payload = btoa(JSON.stringify({ exp: 1, user_id: 1 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    setToken(`x.${payload}.y`);
    expect(isAuthenticated()).toBe(false);
  });
  it('isAuthenticated is true when JWT exp is in the future', () => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, user_id: 1 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    setToken(`x.${payload}.y`);
    expect(isAuthenticated()).toBe(true);
  });
  it('hasSessionSignals is false for a cold guest', () => {
    expect(hasSessionSignals()).toBe(false);
  });
  it('hasSessionSignals is true when session owner is recorded', () => {
    setSessionOwner({ user_id: 9 });
    expect(hasSessionSignals()).toBe(true);
  });
  it('accessTokenExpMs decodes JWT exp', () => {
    const exp = Math.floor(Date.now() / 1000) + 120;
    const payload = btoa(JSON.stringify({ exp, user_id: 1 }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    setToken(`x.${payload}.y`);
    expect(accessTokenExpMs()).toBe(exp * 1000);
  });
});

describe('account-switch per-user wipe (bug #50)', () => {
  it('wipes per-user state when the user id changes to a different account', () => {
    setUser({ user_id: 1 });
    localStorage.setItem('strug_wallet_balance', '500');
    localStorage.setItem('strug_user_address', '1 Main St');
    setUser({ user_id: 2 }); // different account → wipe
    expect(localStorage.getItem('strug_wallet_balance')).toBeNull();
    expect(localStorage.getItem('strug_user_address')).toBeNull();
  });

  it('keeps per-user state when the same account re-authenticates', () => {
    setUser({ user_id: 1 });
    localStorage.setItem('strug_wallet_balance', '500');
    setUser({ user_id: 1 }); // same account → keep
    expect(localStorage.getItem('strug_wallet_balance')).toBe('500');
  });

  it('does not wipe on first login (no previous user)', () => {
    localStorage.setItem('strug_wallet_balance', '500');
    setUser({ user_id: 1 }); // prev id null → no wipe
    expect(localStorage.getItem('strug_wallet_balance')).toBe('500');
  });

  it('preserves device-level prefs (theme/language) across an account switch', () => {
    localStorage.setItem('strug_language', 'fr');
    setUser({ user_id: 1 });
    setUser({ user_id: 2 });
    expect(localStorage.getItem('strug_language')).toBe('fr');
  });

  it('treats the `id` field as the account id too', () => {
    setUser({ id: 1 });
    localStorage.setItem('strug_wallet_balance', '500');
    setUser({ id: 2 });
    expect(localStorage.getItem('strug_wallet_balance')).toBeNull();
  });

  it('wipes video resume positions on account switch so they do not bleed across accounts (#477)', () => {
    setUser({ user_id: 1 });
    sessionStorage.setItem('strug_resume_42', '73');
    sessionStorage.setItem('strug_resume_99', '12');
    setUser({ user_id: 2 }); // different account → resume keys must be gone
    expect(sessionStorage.getItem('strug_resume_42')).toBeNull();
    expect(sessionStorage.getItem('strug_resume_99')).toBeNull();
  });

  it('keeps video resume positions when the same account re-authenticates', () => {
    setUser({ user_id: 1 });
    sessionStorage.setItem('strug_resume_42', '73');
    setUser({ user_id: 1 }); // same account → keep
    expect(sessionStorage.getItem('strug_resume_42')).toBe('73');
  });
});

describe('clearPerUserState / clearAuth', () => {
  it('clearPerUserState removes financial/location keys but not the token', () => {
    setToken('t');
    localStorage.setItem('strug_seller_bank_details', '{...}');
    clearPerUserState();
    expect(localStorage.getItem('strug_seller_bank_details')).toBeNull();
    expect(getToken()).toBe('t');
  });

  it('clearAuth removes token, user, and per-user state', () => {
    setToken('t');
    setUser({ user_id: 1 });
    localStorage.setItem('strug_wallet_balance', '500');
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(localStorage.getItem('strug_wallet_balance')).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });
});

describe('per-account location isolation wiring (setSessionOwner / clearAuth)', () => {
  it('promotes a guest-entered location into the account on sign-in', () => {
    sessionStorage.setItem('strug_user_address', 'Guest Rd'); // guest set a location in this tab
    setSessionOwner({ user_id: 7 });
    expect(localStorage.getItem('strug_user_address:7')).toBe('Guest Rd');
    expect(sessionStorage.getItem('strug_user_address')).toBeNull();
  });

  it('adopts a legacy GLOBAL location only when the SAME account last signed in here', () => {
    setSessionOwner({ user_id: 7 });                  // this browser's last sign-in was account 7
    localStorage.setItem('strug_user_lat', '43.65');  // pre-namespacing global left on the device
    setSessionOwner({ user_id: 7 });                  // 7 signs in again → safe to adopt
    expect(localStorage.getItem('strug_user_lat:7')).toBe('43.65');
    expect(localStorage.getItem('strug_user_lat')).toBeNull();
  });

  it('never adopts a legacy GLOBAL location for a DIFFERENT account', () => {
    setSessionOwner({ user_id: 7 });                  // account 7 last signed in here
    localStorage.setItem('strug_user_lat', '43.65');  // that global belongs to 7
    setSessionOwner({ user_id: 9 });                  // account 9 signs in → must not inherit it
    expect(localStorage.getItem('strug_user_lat:9')).toBeNull();
    expect(localStorage.getItem('strug_user_lat')).toBe('43.65');
  });

  it("clearAuth removes the account's namespaced location and the tab's guest keys", () => {
    setToken('t');
    setUser({ user_id: 7 });
    localStorage.setItem('strug_user_lat:7', '43.65');
    sessionStorage.setItem('strug_user_lng', '31.5');
    clearAuth();
    expect(localStorage.getItem('strug_user_lat:7')).toBeNull();
    expect(sessionStorage.getItem('strug_user_lng')).toBeNull();
  });
});

describe('getAuthUserId prefers JWT over mutable user JSON', () => {
  it('uses the token user_id even when sessionStorage user disagrees', () => {
    // header.payload.sig — payload is {"user_id":42}
    const payload = btoa(JSON.stringify({ user_id: 42 })).replace(/=+$/, '');
    setToken(`x.${payload}.y`);
    setUser({ user_id: 99, name: 'spoofed' });
    expect(userIdFromAccessToken(getToken())).toBe(42);
    expect(getAuthUserId()).toBe(42);
  });
});
