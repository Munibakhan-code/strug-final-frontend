import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import { createStripeIntent, createPaypalOrder } from './payment.js';

describe('payment API wrappers', () => {
  it('createStripeIntent → POST forwarding the commerce pricing fields', async () => {
    server.use(http.post('*/payments/stripe/create-intent', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await createStripeIntent(42.5, {
      purpose: 'commerce',
      vertical: 'shop',
      item_source: 'product',
      items: [{ variation_id: 9, listing_id: 3, qty: 2 }],
      tip: 5,
      shipping_mode: 'delivery',
      shipping_address: '20 Queen St',
      promo_code: 'FIRST15ABCD',
    });
    expect(out.echo).toMatchObject({
      promo_code: 'FIRST15ABCD',
      amount: 42.5,
      currency: 'cad',
      purpose: 'commerce',
      vertical: 'shop',
      item_source: 'product',
      items: [{ variation_id: 9, listing_id: 3, qty: 2 }],
      tip: 5,
      shipping_mode: 'delivery',
      shipping_address: '20 Queen St',
    });
  });

  it('createPaypalOrder → POST forwarding the same commerce pricing fields', async () => {
    server.use(http.post('*/payments/paypal/create-order', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await createPaypalOrder('19.99', {
      purpose: 'commerce',
      vertical: 'food',
      item_source: 'food',
      items: [{ food_item_id: 4, qty: 1 }],
      tip: 2,
      shipping_mode: 'pickup',
      shipping_address: '10 Market St',
      promo_code: 'WIN20XYZ',
    });
    expect(out.echo).toMatchObject({
      promo_code: 'WIN20XYZ',
      amount: '19.99',
      purpose: 'commerce',
      vertical: 'food',
      item_source: 'food',
      items: [{ food_item_id: 4, qty: 1 }],
      tip: 2,
      shipping_mode: 'pickup',
      shipping_address: '10 Market St',
    });
  });

  it('createPaypalOrder → POST forwarding booking quote fields', async () => {
    server.use(http.post('*/payments/paypal/create-order', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await createPaypalOrder('120.00', {
      purpose: 'booking',
      vertical: 'venues',
      booking_listing_id: 77,
      start_date: '2026-10-01',
      guests: 40,
      quantity: 1,
    });
    expect(out.echo).toMatchObject({
      purpose: 'booking',
      vertical: 'venues',
      booking_listing_id: 77,
      start_date: '2026-10-01',
      guests: 40,
      quantity: 1,
    });
  });

  it('createStripeIntent omits booking fields when not provided', async () => {
    server.use(http.post('*/payments/stripe/create-intent', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await createStripeIntent(10, { purpose: 'donation', vertical: 'raise' });
    expect(out.echo.booking_listing_id).toBeUndefined();
    expect(out.echo.booking_id).toBeUndefined();
  });
});
