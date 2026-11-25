import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import {
  getVendors, getFoodItem, createFoodOrder, rejectFoodOrder, autocompleteAddress,
  getFoodVendorWallet, requestFoodVendorPayout, startFoodVendorConnectOnboarding,
  adminApproveFoodPayout, clearVendorBranding,
} from './food.js';

describe('food API wrappers', () => {
  it('getVendors → GET /food/vendors with query params', async () => {
    server.use(http.get('*/food/vendors', ({ request }) => {
      const u = new URL(request.url);
      return HttpResponse.json({ city: u.searchParams.get('city') });
    }));
    expect(await getVendors({ city: 'Toronto' })).toEqual({ city: 'Toronto' });
  });

  it('getFoodItem → GET /food/items/:id', async () => {
    server.use(http.get('*/food/items/:id', ({ params }) => HttpResponse.json({ id: params.id })));
    expect(await getFoodItem(77)).toEqual({ id: '77' });
  });

  it('createFoodOrder → POST /food/orders with the body', async () => {
    server.use(http.post('*/food/orders', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await createFoodOrder({ vendor_id: 1, items: [{ id: 2, qty: 3 }] });
    expect(out.echo).toEqual({ vendor_id: 1, items: [{ id: 2, qty: 3 }] });
  });

  it('rejectFoodOrder → PUT /food/orders/:id/reject mapping reason → rejection_reason', async () => {
    server.use(http.put('*/food/orders/:id/reject', async ({ request, params }) =>
      HttpResponse.json({ id: params.id, body: await request.json() })));
    const out = await rejectFoodOrder(5, 'out of stock');
    expect(out).toEqual({ id: '5', body: { rejection_reason: 'out of stock' } });
  });

  it('autocompleteAddress → GET /food/autocomplete?q=', async () => {
    server.use(http.get('*/food/autocomplete', ({ request }) => {
      const u = new URL(request.url);
      return HttpResponse.json({ q: u.searchParams.get('q') });
    }));
    expect(await autocompleteAddress('123 Main')).toEqual({ q: '123 Main' });
  });

  it('getFoodVendorWallet → GET /food/vendor/me/wallet', async () => {
    server.use(http.get('*/food/vendor/me/wallet', ({ request }) => {
      const u = new URL(request.url);
      return HttpResponse.json({ available_balance: 10, vendor: u.searchParams.get('vendor_id') });
    }));
    expect(await getFoodVendorWallet({ vendor_id: 9 })).toEqual({ available_balance: 10, vendor: '9' });
  });

  it('requestFoodVendorPayout → POST /food/vendor/me/wallet/payout-request', async () => {
    server.use(http.post('*/food/vendor/me/wallet/payout-request', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    expect(await requestFoodVendorPayout(150)).toEqual({ echo: { amount: 150 } });
  });

  it('startFoodVendorConnectOnboarding → POST connect/onboard with return_path', async () => {
    server.use(http.post('*/food/vendor/me/wallet/connect/onboard', async ({ request }) =>
      HttpResponse.json({ url: 'https://connect.stripe.com/x', body: await request.json() })));
    const out = await startFoodVendorConnectOnboarding({ return_path: '/provider/restbookings' });
    expect(out.body).toEqual({ return_path: '/provider/restbookings' });
    expect(out.url).toContain('stripe.com');
  });

  it('adminApproveFoodPayout → POST admin approve', async () => {
    server.use(http.post('*/food/vendor/admin/payouts/:id/approve', async ({ request, params }) =>
      HttpResponse.json({ id: params.id, body: await request.json() })));
    expect(await adminApproveFoodPayout(3, 'ok')).toEqual({ id: '3', body: { note: 'ok' } });
  });

  it('clearVendorBranding → PUT /food/vendors/:id with banner_url null', async () => {
    server.use(http.put('*/food/vendors/:id', async ({ request, params }) =>
      HttpResponse.json({ id: params.id, body: await request.json() })));
    const out = await clearVendorBranding(12, 'banner');
    expect(out.body).toEqual({ banner_url: null });
  });

  it('clearVendorBranding falls back to empty string when PUT null is rejected', async () => {
    server.use(http.put('*/food/vendors/:id', async ({ request, params }) => {
      const body = await request.json();
      if (body.banner_url === null) return new HttpResponse(null, { status: 400 });
      return HttpResponse.json({ id: params.id, body });
    }));
    const out = await clearVendorBranding(12, 'banner');
    expect(out.body).toEqual({ banner_url: '' });
  });
});
