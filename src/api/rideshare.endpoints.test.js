import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/server.js';
import {
  getNearbyRides, getFareEstimate, acceptRide, verifyRideOtp,
  getPassengerRideHistory, getDriverAvailability, parseNearbyDrivers,
} from './rideshare.js';
import { trackRideEvent } from './rideshareAnalytics.js';

beforeEach(() => localStorage.clear());

describe('rideshare API wrappers', () => {

  it('posts only the minimized rideshare analytics payload', async () => {
    let body;
    server.use(http.post('*/ride-request/analytics', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ successful: true }, { status: 202 });
    }));
    await expect(trackRideEvent('vehicle_selected', {
      ride_request_id: 42, vehicle_type: 'economy', pickup: 'private',
      coordinates: { lat: 1, lng: 2 }, card_number: '4111', unexpected: 'drop',
    })).resolves.toBe(true);
    expect(body).toEqual({ event: 'vehicle_selected', ride_request_id: 42, vehicle_type: 'economy' });
  });

  it('minimizes pickup adjustment analytics to its confidence category', async () => {
    let body;
    server.use(http.post('*/ride-request/analytics', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ successful: true }, { status: 202 });
    }));
    await trackRideEvent('pickup_adjusted', { confidence: 'low', pickup: 'private address', coordinates: { lat: 1, lng: 2 } });
    expect(body).toEqual({ event: 'pickup_adjusted', confidence: 'low' });
  });

  it('resolves false without throwing when analytics transport fails', async () => {
    server.use(http.post('*/ride-request/analytics', () => HttpResponse.error()));
    await expect(trackRideEvent('page_viewed')).resolves.toBe(false);
  });
  it.each([
    [[{ id: 1 }], [{ id: 1 }]],
    [{ data: [{ id: 2 }] }, [{ id: 2 }]],
    [{ drivers: [{ id: 3 }] }, [{ id: 3 }]],
    [null, []],
    [{ data: 'bad', drivers: {} }, []],
  ])('parseNearbyDrivers normalizes supported payloads', (payload, expected) => {
    expect(parseNearbyDrivers(payload)).toEqual(expected);
  });

  it('getDriverAvailability keeps the availability response unwrapped', async () => {
    server.use(http.get('*/ride-request/drivers/availability', () =>
      HttpResponse.json({ successful: true, data: { available: true, count: 2 } })));
    await expect(getDriverAvailability()).resolves.toEqual({
      successful: true,
      data: { available: true, count: 2 },
    });
  });

  it('getNearbyRides → GET /ride-request/nearby with query params, unwrapped', async () => {
    server.use(http.get('*/ride-request/nearby', ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json({ lat: url.searchParams.get('lat'), data: [1] });
    }));
    const out = await getNearbyRides({ lat: '6.9', lng: '79.8' });
    expect(out).toEqual({ lat: '6.9', data: [1] });
  });

  it('getFareEstimate → POST /ride-request/fare-estimate with the body', async () => {
    server.use(http.post('*/ride-request/fare-estimate', async ({ request }) =>
      HttpResponse.json({ echo: await request.json() })));
    const out = await getFareEstimate('A', 'B', 'economy');
    expect(out.echo).toEqual({ pickup: 'A', dropoff: 'B', vehicle_type: 'economy' });
  });

  it('acceptRide → PUT /ride-request/:id/accept with driver_profile_id', async () => {
    server.use(http.put('*/ride-request/:id/accept', async ({ request, params }) =>
      HttpResponse.json({ id: params.id, body: await request.json() })));
    const out = await acceptRide(42, 7);
    expect(out).toEqual({ id: '42', body: { driver_profile_id: 7 } });
  });

  it('verifyRideOtp → PATCH /active-trip/:tripId/verify-otp with otp', async () => {
    server.use(http.patch('*/active-trip/:tripId/verify-otp', async ({ request, params }) =>
      HttpResponse.json({ tripId: params.tripId, body: await request.json() })));
    const out = await verifyRideOtp(99, '1234');
    expect(out).toEqual({ tripId: '99', body: { otp: '1234' } });
  });

  it('getPassengerRideHistory → GET /ride-request/passenger/me (server-scoped, no uid in URL)', async () => {
    // The endpoint scopes to the authenticated user via JWT on the server — the client
    // must NOT put a user id in the path (closes the prior IDOR where uid came from localStorage).
    server.use(http.get('*/ride-request/passenger/me', () =>
      HttpResponse.json({ successful: true, data: [{ id: 1 }] })));
    const out = await getPassengerRideHistory();
    expect(out).toEqual({ successful: true, data: [{ id: 1 }] });
  });

  it('getPassengerRideHistory ignores any stored user id and still hits /passenger/me', async () => {
    localStorage.setItem('user', JSON.stringify({ user_id: 5 }));
    let hitPath = null;
    server.use(http.get('*/ride-request/passenger/me', ({ request }) => {
      hitPath = new URL(request.url).pathname;
      return HttpResponse.json({ successful: true, data: [] });
    }));
    await getPassengerRideHistory();
    expect(hitPath).toMatch(/\/ride-request\/passenger\/me$/);
  });

  it('getPassengerRideHistory forwards query params', async () => {
    server.use(http.get('*/ride-request/passenger/me', ({ request }) => {
      const url = new URL(request.url);
      return HttpResponse.json({ limit: url.searchParams.get('limit'), data: [] });
    }));
    const out = await getPassengerRideHistory({ limit: 50 });
    expect(out.limit).toBe('50');
  });
});
