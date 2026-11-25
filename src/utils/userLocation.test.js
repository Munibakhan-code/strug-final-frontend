import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLocationItem,
  setLocationItem,
  removeLocationItem,
  clearUserLocation,
  migrateLegacyLocationForOwner,
  promoteGuestLocationToUser,
} from './userLocation.js';
import { setToken } from '../store/auth.js';

// Craft an unsigned JWT whose payload carries a user_id — getAuthUserId() prefers the token,
// so this is how a test tab "signs in" as a given account.
const b64url = (obj) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenFor = (id) => `x.${b64url({ user_id: id })}.y`;

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('userLocation — signed-in namespacing', () => {
  it('writes/reads under `${base}:${userId}` in localStorage (never the global key)', () => {
    setToken(tokenFor(7));
    setLocationItem('strug_user_lat', '43.65');
    expect(localStorage.getItem('strug_user_lat:7')).toBe('43.65');
    expect(localStorage.getItem('strug_user_lat')).toBeNull();
    expect(getLocationItem('strug_user_lat')).toBe('43.65');
  });

  it('keeps two accounts independent — no cross-account bleed', () => {
    setToken(tokenFor(1));
    setLocationItem('strug_user_address', 'User1 Ave');

    setToken(tokenFor(2));
    expect(getLocationItem('strug_user_address')).toBeNull(); // account 2 starts clean
    setLocationItem('strug_user_address', 'User2 Blvd');

    setToken(tokenFor(1));
    expect(getLocationItem('strug_user_address')).toBe('User1 Ave'); // account 1 untouched
  });

  it('removeLocationItem clears only the active account key', () => {
    setToken(tokenFor(7));
    setLocationItem('strug_user_lng', '-79.38');
    removeLocationItem('strug_user_lng');
    expect(getLocationItem('strug_user_lng')).toBeNull();
  });
});

describe('userLocation — guest isolation', () => {
  it('writes/reads a plain base key in sessionStorage (per-tab) when there is no account', () => {
    setLocationItem('strug_user_lat', '31.5');
    expect(sessionStorage.getItem('strug_user_lat')).toBe('31.5');
    expect(localStorage.getItem('strug_user_lat')).toBeNull();
    expect(getLocationItem('strug_user_lat')).toBe('31.5');
  });
});

describe('clearUserLocation', () => {
  it("removes a user's namespaced keys and this tab's guest keys", () => {
    localStorage.setItem('strug_user_lat:7', '43.65');
    sessionStorage.setItem('strug_user_lat', '31.5');
    clearUserLocation(7);
    expect(localStorage.getItem('strug_user_lat:7')).toBeNull();
    expect(sessionStorage.getItem('strug_user_lat')).toBeNull();
  });
});

describe('migrateLegacyLocationForOwner', () => {
  it('adopts legacy global keys into the namespace, then clears the globals', () => {
    localStorage.setItem('strug_user_address', 'Old Global St');
    migrateLegacyLocationForOwner(7);
    expect(localStorage.getItem('strug_user_address:7')).toBe('Old Global St');
    expect(localStorage.getItem('strug_user_address')).toBeNull();
  });

  it('never clobbers an existing namespaced value (still clears the legacy global)', () => {
    localStorage.setItem('strug_user_address', 'Legacy');
    localStorage.setItem('strug_user_address:7', 'Kept');
    migrateLegacyLocationForOwner(7);
    expect(localStorage.getItem('strug_user_address:7')).toBe('Kept');
    expect(localStorage.getItem('strug_user_address')).toBeNull();
  });
});

describe('promoteGuestLocationToUser', () => {
  it('carries a guest-entered location into the user namespace and clears the guest bucket', () => {
    sessionStorage.setItem('strug_user_address', 'Guest Rd');
    promoteGuestLocationToUser(7);
    expect(localStorage.getItem('strug_user_address:7')).toBe('Guest Rd');
    expect(sessionStorage.getItem('strug_user_address')).toBeNull();
  });

  it("does not clobber the account's already-saved location", () => {
    localStorage.setItem('strug_user_address:7', 'Saved');
    sessionStorage.setItem('strug_user_address', 'Guest Rd');
    promoteGuestLocationToUser(7);
    expect(localStorage.getItem('strug_user_address:7')).toBe('Saved');
    expect(sessionStorage.getItem('strug_user_address')).toBeNull();
  });
});
