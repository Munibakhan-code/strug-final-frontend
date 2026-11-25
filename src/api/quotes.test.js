import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import {
  getQuoteCategories, createQuoteRequest, getQuoteRequest,
  cancelQuoteRequest, getQuoteAvailability,
} from './quotes.js';

describe('quotes API wrappers', () => {
  it('getQuoteCategories → GET /quote-categories?vertical=&live=1', async () => {
    server.use(http.get('*/quote-categories', ({ request }) => {
      const u = new URL(request.url);
      return HttpResponse.json({ vertical: u.searchParams.get('vertical'), live: u.searchParams.get('live') });
    }));
    const out = await getQuoteCategories('insurance');
    expect(out).toEqual({ vertical: 'insurance', live: '1' });
  });

  it('getQuoteCategories({ live: false }) omits live param', async () => {
    server.use(http.get('*/quote-categories', ({ request }) => {
      const u = new URL(request.url);
      return HttpResponse.json({ vertical: u.searchParams.get('vertical'), live: u.searchParams.get('live') });
    }));
    const out = await getQuoteCategories('mortgage', { live: false });
    expect(out).toEqual({ vertical: 'mortgage', live: null });
  });

  it('createQuoteRequest → POST /quote-requests with the body', async () => {
    server.use(http.post('*/quote-requests', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await createQuoteRequest({ category_id: 3, city: 'Toronto' });
    expect(out.echo).toEqual({ category_id: 3, city: 'Toronto' });
  });

  it('getQuoteRequest → GET /quote-requests/:id', async () => {
    server.use(http.get('*/quote-requests/:id', ({ params }) =>
      HttpResponse.json({ id: params.id })));
    expect(await getQuoteRequest(12)).toEqual({ id: '12' });
  });

  it('cancelQuoteRequest → PATCH /quote-requests/:id/cancel', async () => {
    server.use(http.patch('*/quote-requests/:id/cancel', ({ params }) =>
      HttpResponse.json({ cancelled: params.id })));
    expect(await cancelQuoteRequest(8)).toEqual({ cancelled: '8' });
  });

  it('getQuoteAvailability → GET /quote-requests/:id/availability?quote_id=', async () => {
    server.use(http.get('*/quote-requests/:id/availability', ({ request, params }) => {
      const u = new URL(request.url);
      return HttpResponse.json({ id: params.id, quote_id: u.searchParams.get('quote_id') });
    }));
    expect(await getQuoteAvailability(4, 99)).toEqual({ id: '4', quote_id: '99' });
  });
});
