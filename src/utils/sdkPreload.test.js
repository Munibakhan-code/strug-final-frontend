import { describe, it, expect, vi } from 'vitest';
import {
  routeNeedsHeavySdks,
  SDK_FREE_ROUTES,
  setActiveRoute,
  subscribeActiveRoute,
} from './sdkPreload.js';

// Every nav id in App.jsx's NAV_ITEMS. The gate is a DENY-list precisely so that a new
// vertical added here is payment-capable by default — the safe direction to be wrong in.
const ALL_NAV_IDS = [
  'home', 'become', 'ondemand', 'videos', 'shop', 'food', 'rideshare', 'feed', 'live',
  'social', 'tempstay', 'community', 'reservations', 'groceries', 'lessons', 'preconstruct',
  'events', 'venues', 'equipment', 'floral', 'realestate', 'decor', 'automotive', 'vehicles',
  'hotel', 'courier', 'insurance', 'mortgage', 'pinboard', 'favourites', 'experiences',
  'wedding', 'proservices', 'digservices', 'artists', 'secondhand', 'celebrity', 'discounts',
  'portfolio', 'influencer', 'bookartist', 'books', 'medical', 'catering', 'raise', 'meet',
  'digproducts', 'learn', 'refcodes', 'wallet', 'messages', 'dashboard', 'orders', 'settings',
  'help',
];

// Routes that take money. If any of these ever stopped arming Stripe, checkout would break —
// <Elements> would keep a null stripe forever, since the wrapper is its only loader.
const PAYMENT_ROUTES = [
  'shop', 'food', 'rideshare', 'groceries', 'events', 'venues', 'hotel', 'courier',
  'tempstay', 'floral', 'decor', 'books', 'secondhand', 'digproducts', 'discounts',
  'wedding', 'catering', 'raise', 'wallet', 'orders', 'ondemand', 'equipment', 'vehicles',
];

describe('heavy-SDK route gate', () => {
  it('skips the SDKs on the media routes people idle on', () => {
    expect(routeNeedsHeavySdks('videos')).toBe(false);
    expect(routeNeedsHeavySdks('feed')).toBe(false);
    expect(routeNeedsHeavySdks('social')).toBe(false);
  });

  it('never starves a payment-capable route of Stripe', () => {
    for (const route of PAYMENT_ROUTES) {
      expect(routeNeedsHeavySdks(route), `${route} must load Stripe`).toBe(true);
    }
  });

  it('defaults an unknown / newly added vertical to loading the SDKs', () => {
    expect(routeNeedsHeavySdks('some-new-vertical-2027')).toBe(true);
  });

  it('only ever exempts routes that are real nav ids', () => {
    for (const id of SDK_FREE_ROUTES) {
      expect(ALL_NAV_IDS, `${id} is not a nav id`).toContain(id);
    }
  });

  it('publishes route changes to subscribers (how <Elements> above AppInner sees them)', () => {
    const seen = vi.fn();
    const unsubscribe = subscribeActiveRoute(seen);
    setActiveRoute('videos');
    setActiveRoute('shop');
    setActiveRoute('shop'); // no-op: same route must not re-notify
    unsubscribe();
    setActiveRoute('food'); // after unsubscribe: must not fire
    expect(seen.mock.calls.map(c => c[0])).toEqual(['videos', 'shop']);
  });
});
