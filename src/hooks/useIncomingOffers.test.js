import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// A fake socket that records handlers so the test can fire an incoming event.
const handlers = {};
const fakeSocket = {
  on: (ev, fn) => { handlers[ev] = fn; },
  off: (ev) => { delete handlers[ev]; },
};

vi.mock('../api/socket', () => ({
  connectSocket: () => fakeSocket,
  getSocket: () => fakeSocket,
}));
vi.mock('../store/auth', () => ({ getAuthUserId: () => 6 }));
const acceptRide = vi.fn(() => Promise.resolve({ ok: true }));
const declineRide = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock('../api/rideshare', () => ({
  acceptRide: (...a) => acceptRide(...a),
  declineRide: (...a) => declineRide(...a),
}));

import { useIncomingOffers } from './useIncomingOffers.js';

// Matches what utils/ride-dispatch.js actually emits, entity_type included — the hook now keys
// off it, and a fixture without one was letting non-offers through in the real app.
const rideNotif = {
  notification_id: 1, vertical: 'rideshare', type: 'ride.offer', urgency: 'actionable',
  title: 'Incoming ride request', entity_type: 'ride_request', entity_id: 42, action_url: 'sd-drive',
  expires_at: new Date(Date.now() + 120000).toISOString(),
  data: { pickup_location: 'King St W', dropoff_location: 'Union', driver_payout: 18.4, expires_at: new Date(Date.now() + 120000).toISOString() },
};

// Same vertical, same urgency, same numeric id — but an SOS incident, not a ride.
const sosNotif = {
  notification_id: 2, vertical: 'rideshare', type: 'sos.acknowledged', urgency: 'actionable',
  title: 'SOS received', entity_type: 'trip_sos_incident', entity_id: 42, action_url: 'sd-drive',
  body: "We've been alerted.",
};

beforeEach(() => { for (const k in handlers) delete handlers[k]; acceptRide.mockClear(); declineRide.mockClear(); });

describe('useIncomingOffers', () => {
  it('surfaces an actionable notification as the current offer', async () => {
    const nav = vi.fn();
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'home', navigateTo: nav }));
    act(() => handlers['notification:new'](rideNotif));
    await waitFor(() => expect(result.current.offer).toBeTruthy());
    expect(result.current.offer.vertical).toBe('rideshare');
    expect(result.current.offer.rideId).toBe(42);
    expect(result.current.offer.from).toBe('King St W');
  });

  it('ignores ambient notifications', async () => {
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'home', navigateTo: vi.fn() }));
    act(() => handlers['notification:new']({ ...rideNotif, urgency: 'ambient' }));
    expect(result.current.offer).toBeNull();
  });

  it('accept calls acceptRide with the ride id and navigates to the drive dashboard', async () => {
    const nav = vi.fn();
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'home', navigateTo: nav }));
    act(() => handlers['notification:new'](rideNotif));
    await waitFor(() => expect(result.current.offer).toBeTruthy());
    await act(async () => { await result.current.accept(result.current.offer); });
    expect(acceptRide).toHaveBeenCalledWith(42);
    expect(nav).toHaveBeenCalledWith('sd-drive');
    expect(result.current.offer).toBeNull(); // removed after accept
  });

  it('is suppressed while the driver is already on the offer dashboard', async () => {
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'sd-drive', navigateTo: vi.fn() }));
    act(() => handlers['notification:new'](rideNotif));
    // offer is queued but not surfaced (dashboard shows its own card)
    await waitFor(() => expect(handlers['notification:new']).toBeTruthy());
    expect(result.current.offer).toBeNull();
  });

  it('does nothing until auth is ready', () => {
    renderHook(() => useIncomingOffers(false, { activeNav: 'home', navigateTo: vi.fn() }));
    expect(handlers['notification:new']).toBeUndefined();
  });

  // Regression: an SOS acknowledgement rendered as a claim card, and its Decline button fired
  // PUT /ride-request/<incident_id>/decline against whatever ride happened to hold that number.
  it('does not turn an SOS acknowledgement into a claimable offer', async () => {
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'home', navigateTo: vi.fn() }));
    act(() => handlers['notification:new'](sosNotif));
    expect(result.current.offer).toBeNull();
    expect(acceptRide).not.toHaveBeenCalled();
    expect(declineRide).not.toHaveBeenCalled();
  });

  it('does not turn a driver document verdict into a claimable offer', async () => {
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'home', navigateTo: vi.fn() }));
    act(() => handlers['notification:new']({
      ...sosNotif, type: 'driver_doc.status_changed', entity_type: 'driver_document', entity_id: 1,
    }));
    expect(result.current.offer).toBeNull();
  });

  // The offer key used to be `${vertical}:${entity_id}`, so an SOS card already on screen made a
  // genuine ride offer with the same number look like a duplicate and get dropped.
  it('a non-ride rideshare notification cannot crowd out a real offer with the same id', async () => {
    const { result } = renderHook(() => useIncomingOffers(true, { activeNav: 'home', navigateTo: vi.fn() }));
    act(() => handlers['notification:new'](sosNotif));
    act(() => handlers['notification:new'](rideNotif));
    await waitFor(() => expect(result.current.offer).toBeTruthy());
    expect(result.current.offer.rideId).toBe(42);
    expect(result.current.offer.title).toBe('Incoming ride request');
  });
});
