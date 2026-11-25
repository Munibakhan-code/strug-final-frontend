import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const api = vi.hoisted(() => ({
  getFareEstimates: vi.fn(),
  getNearbyRides: vi.fn(),
  getDriverAvailability: vi.fn(),
  createRideRequest: vi.fn(),
  confirmRidePayment: vi.fn(),
  getRideRequest: vi.fn(),
  rateRide: vi.fn(),
  cancelRide: vi.fn(),
}));
const analytics = vi.hoisted(() => ({ trackRideEvent: vi.fn(() => Promise.resolve(true)) }));
const viewport = vi.hoisted(() => ({ isMobile: false }));
const testSocket = vi.hoisted(() => ({
  handlers: new Map(), connected: true,
  on: vi.fn((event, handler) => testSocket.handlers.set(event, handler)),
  off: vi.fn((event, handler) => { if (testSocket.handlers.get(event) === handler) testSocket.handlers.delete(event); }),
}));

vi.mock('../hooks/usePageLoad.js', () => ({ usePageLoad: () => false }));
vi.mock('../hooks/useViewport.js', () => ({ useViewport: () => viewport }));
vi.mock('../hooks/usePageI18n.js', () => ({
  usePageI18n: () => ({ t: (key) => key.split('.').at(-1), landingTitle: 'Book a ride' }),
}));
vi.mock('../i18n/index.js', () => {
  const copy = {
    pickupConfidenceHigh: 'Pickup confidence: High', pickupConfidenceMedium: 'Pickup confidence: Medium',
    pickupConfidenceLow: 'Pickup needs confirmation', pickupConfidenceUnknown: 'Pickup availability is temporarily unknown',
    pickupReasonRouteUnresolved: 'Confirm your exact pickup point so the route can be resolved.',
    pickupReasonNoDrivers: 'No nearby drivers are currently visible for this pickup.',
    pickupReasonLimitedSupply: 'Nearby driver supply is limited right now.', pickupReasonGoodSupply: 'Drivers are available nearby for this pickup.',
    pickupReasonUnknown: 'Driver availability cannot be checked right now.', pickupReasonFallback: 'Check the pickup details before choosing your ride.',
    confirmPickup: 'Confirm pickup', matchingContacting: 'Contacting nearby drivers…', matchingExpanding: 'Expanding the search…',
    matchingDelayed: 'This is taking longer than usual', matchingSupport: 'We’ll keep checking for a driver. You can continue waiting or leave this search safely.',
    continueWaiting: 'Continue waiting', changeRide: 'Change ride', cancelRide: 'Cancel Ride',
    locationFresh: 'Driver location updated recently.', locationStale: 'Driver location may be delayed.', driverArrived: 'Your driver has arrived.',
    feedbackGreatPickup: 'Great pickup', feedbackSafeDriving: 'Safe driving', feedbackCleanVehicle: 'Clean vehicle', feedbackEasyToFind: 'Easy to find',
    bookAgain: 'Book again', reportIssue: 'Report an issue',
    recenterMap: 'Centre the test map', zoomIn: 'Magnify the test map', zoomOut: 'Shrink the test map',
    tripVerificationCode: 'Trip verification code',
  };
  return { default: { t: (key) => copy[key.split('.').at(-1)] ?? key.split('.').at(-1) } };
});
vi.mock('../utils/googleMaps.js', () => ({ loadGoogleMaps: () => Promise.resolve(null) }));
vi.mock('../utils/locationSearch.js', () => ({
  formatCoords: () => 'Current location',
  reverseGeocodeCoords: () => Promise.resolve('Current location'),
  geocodeAddressFallback: (address) => Promise.resolve(address ? { lat: 43.65, lng: -79.38 } : null),
}));
vi.mock('../utils/route.js', () => ({
  fetchRouteMeta: (_pickup, _dropoff, callback) => callback({
    path: [[43.65, -79.38], [43.66, -79.39]], durationMin: 12, distanceKm: 5.2, status: 'OK', source: 'test',
  }),
}));
vi.mock('../components/shared.jsx', () => ({
  AddressAutocomplete: ({ value = '', onChange, ariaLabel, useLocation }) => (
    <label>{ariaLabel}<input aria-label={ariaLabel} value={value} onChange={(event) => onChange?.(event.target.value)} data-current-location={useLocation ? 'true' : 'false'} /></label>
  ),
  Tooltip: ({ children }) => children,
}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null, Marker: () => null, Polyline: () => null,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));
vi.mock('../components/SmoothMarker.jsx', () => ({ default: () => null }));
vi.mock('../api/socket', () => ({ connectSocket: () => testSocket, joinTripRoom: vi.fn(), leaveTripRoom: vi.fn() }));
vi.mock('../store/auth', () => ({ getUser: () => null }));
vi.mock('../api/user', () => ({ getWalletBalance: () => Promise.resolve({ balance: 100 }), getAddresses: () => Promise.resolve({ successful: true, data: [] }) }));
vi.mock('@stripe/react-stripe-js', () => ({ useStripe: () => null, useElements: () => null, CardElement: () => null }));
vi.mock('@paypal/react-paypal-js', () => ({ PayPalButtons: () => null }));
vi.mock('../api/rideshare', async () => {
  const actual = await vi.importActual('../api/rideshare');
  return { ...actual, ...api };
});
vi.mock('../api/rideshareAnalytics.js', () => analytics);

import { canApplyRideTransition } from '../utils/rideshareRiderExperience.js';
import { GoogleRidePreviewMap, RideshareMapView, RidesharePage, RidesharePaymentView } from './Rideshare.jsx';

describe('rideshare map controls', () => {
  it('uses localized accessible names and 44px touch targets', () => {
    render(<GoogleRidePreviewMap maps={null} center={[43.65, -79.38]} route={[]} />);
    expect(screen.getByRole('button', { name: 'Centre the test map' })).toHaveStyle({ width: '44px', height: '44px' });
    expect(screen.getByRole('button', { name: 'Magnify the test map' })).toHaveStyle({ width: '44px', height: '44px' });
    expect(screen.getByRole('button', { name: 'Shrink the test map' })).toHaveStyle({ width: '44px', height: '44px' });
  });
});

describe('rideshare lifecycle ordering', () => {
  it.each([
    ['matched', 'searching', false], ['inride', 'matched', false], ['done', 'inride', false],
    ['cancelled', 'matched', false], ['no_driver', 'searching', false], ['matched', 'inride', true],
    ['searching', 'cancelled', true],
  ])('%s -> %s allowed=%s', (current, next, allowed) => {
    expect(canApplyRideTransition(current, next)).toBe(allowed);
  });
});

describe('RideshareMapView lifecycle', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    testSocket.handlers.clear();
    sessionStorage.clear();
    viewport.isMobile = false;
  });

  it('shows no actionable ride state before authoritative hydration resolves', async () => {
    let resolveRide;
    api.getRideRequest
      .mockReturnValueOnce(new Promise((resolve) => { resolveRide = resolve; }))
      .mockReturnValue(new Promise(() => {}));
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(screen.getByText(/loading trip details/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change ride|cancel ride|message driver|back/i })).not.toBeInTheDocument();
    await act(async () => resolveRide({ data: { ride_request_id: 41, status: 'pending' } }));
    expect(await screen.findByRole('button', { name: /change ride/i })).toBeInTheDocument();
  });

  it('deduplicates ride lifecycle events across remounts without suppressing a different ride', async () => {
    api.getRideRequest.mockImplementation((rideId) => Promise.resolve({ data: { ride_request_id: rideId, status: 'pending' } }));
    const first = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    first.unmount();
    const second = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    second.unmount();
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={42} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    // The lifecycle dedup delivery (deliverRideLifecycleAnalytics) resolves asynchronously
    // after the "continue waiting" button appears, so wait for it rather than asserting
    // immediately — otherwise this races and flakes under CI load.
    await waitFor(() => {
      expect(analytics.trackRideEvent.mock.calls.filter(([event, metadata]) => event === 'matching_started' && metadata.ride_request_id === 41)).toHaveLength(1);
      expect(analytics.trackRideEvent.mock.calls.filter(([event, metadata]) => event === 'matching_started' && metadata.ride_request_id === 42)).toHaveLength(1);
    });
  });

  it('retries an undelivered lifecycle event after remount and persists only success', async () => {
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 61, status: 'pending' } });
    analytics.trackRideEvent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const first = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={61} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    await waitFor(() => expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(1));
    first.unmount();
    const second = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={61} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    await waitFor(() => expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(2));
    second.unmount();
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={61} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    await act(async () => {});
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(2);
  });

  it('coalesces concurrent lifecycle delivery attempts for the same ride', async () => {
    let resolveDelivery;
    analytics.trackRideEvent.mockReturnValueOnce(new Promise((resolve) => { resolveDelivery = resolve; }));
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 62, status: 'pending' } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={62} onBack={vi.fn()} />);
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={62} onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: /continue waiting/i })).toHaveLength(2));
    await waitFor(() => expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(1));
    await act(async () => resolveDelivery(true));
  });

  it('uses bounded delivered memory when storage becomes unavailable after success', async () => {
    sessionStorage.setItem('strug_rideshare_analytics_v1', JSON.stringify(
      Array.from({ length: 256 }, (_, index) => `session:matched:${1000 + index}`),
    ));
    analytics.trackRideEvent.mockResolvedValue(true);
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 71, status: 'pending' } });
    const first = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={71} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    await waitFor(() => expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(1));
    await waitFor(() => expect(JSON.parse(sessionStorage.getItem('strug_rideshare_analytics_v1'))).toHaveLength(256));
    first.unmount();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    try {
      render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={71} onBack={vi.fn()} />);
      await screen.findByRole('button', { name: /continue waiting/i });
      await act(async () => {});
      expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(1);
    } finally {
      getItem.mockRestore();
    }
  });

  it('deduplicates matched and arrival events across remounts for the same ride', async () => {
    api.getRideRequest.mockImplementation((rideId) => Promise.resolve({ data: {
      ride_request_id: rideId, status: 'accepted',
      active_trip: [{ trip_id: rideId + 100, driver_arrived_at: '2026-07-22T12:00:00Z', driver_profile: {} }],
    } }));
    const first = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={51} onBack={vi.fn()} />);
    await screen.findByText(/driver has arrived/i);
    first.unmount();
    const second = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={51} onBack={vi.fn()} />);
    await screen.findByText(/driver has arrived/i);
    second.unmount();
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={52} onBack={vi.fn()} />);
    await screen.findByText(/driver has arrived/i);
    // Lifecycle analytics deliver asynchronously after arrival UI paints — wait like the
    // matching_started remount test, otherwise this races under CI load.
    await waitFor(() => {
      for (const event of ['matched', 'driver_arrived']) {
        expect(analytics.trackRideEvent.mock.calls.filter(([name, metadata]) => name === event && metadata.ride_request_id === 51)).toHaveLength(1);
        expect(analytics.trackRideEvent.mock.calls.filter(([name, metadata]) => name === event && metadata.ride_request_id === 52)).toHaveLength(1);
      }
    });
  });

  it('ignores a deferred pending hydration response after socket acceptance', async () => {
    let resolveRide;
    api.getRideRequest.mockReturnValue(new Promise((resolve) => { resolveRide = resolve; }));
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await act(async () => testSocket.handlers.get('ride-accepted-41')?.({ trip_id: 7, driver: { id: 3, name: 'Maya' } }));
    expect(screen.getByText('Maya')).toBeInTheDocument();
    await act(async () => resolveRide({ data: { ride_request_id: 41, status: 'pending' } }));
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change ride/i })).not.toBeInTheDocument();
  });

  it('keeps newer socket driver details when a deferred same-state accepted response resolves', async () => {
    let resolveRide;
    api.getRideRequest
      .mockReturnValueOnce(new Promise((resolve) => { resolveRide = resolve; }))
      .mockReturnValue(new Promise(() => {}));
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await act(async () => testSocket.handlers.get('ride-accepted-41')?.({ trip_id: 9, otp: '9999', driver_arrived_at: '2026-07-22T12:00:00Z', driver: { id: 4, name: 'New Driver' } }));
    await act(async () => resolveRide({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, otp_code: '1111', driver_profile: { user: { name: 'Old Driver' } } }] } }));
    expect(screen.getByText('New Driver')).toBeInTheDocument();
    expect(screen.getByText('9999')).toBeInTheDocument();
    expect(screen.getByText(/driver has arrived/i)).toBeInTheDocument();
    expect(screen.queryByText('Old Driver')).not.toBeInTheDocument();
  });

  it('merges newer nested arrival and location data when ride lifecycle timestamp is unchanged', async () => {
    const lifecycleAt = new Date(Date.now() - 10_000).toISOString();
    api.getRideRequest
      .mockResolvedValueOnce({ data: { ride_request_id: 41, status: 'accepted', status_updated_at: lifecycleAt, active_trip: [{ trip_id: 7, driver_profile: { current_lat: 43.65, current_long: -79.38, location_updated_at: new Date(Date.now() - 9_000).toISOString() } }] } })
      .mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', status_updated_at: lifecycleAt, active_trip: [{ trip_id: 7, driver_arrived_at: new Date(Date.now() - 5_000).toISOString(), driver_profile: { current_lat: 43.65, current_long: -79.38, location_updated_at: new Date(Date.now() - 5_000).toISOString() } }] } });
    const view = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByText(/driver has arrived/i)).toBeInTheDocument();
    expect(screen.getByText(/location updated recently/i)).toBeInTheDocument();
    view.unmount();
  });

  it('enriches the same driver from ordered snapshots and sparse updates do not clear details', async () => {
    const lifecycleAt = '2026-07-22T12:00:00Z';
    api.getRideRequest
      .mockResolvedValueOnce({ data: { ride_request_id: 41, status: 'accepted', status_updated_at: lifecycleAt, active_trip: [{ trip_id: 7, driver_profile: { driver_profile_id: 3, user: { name: 'Maya' } } }] } })
      .mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', status_updated_at: lifecycleAt, active_trip: [{ trip_id: 7, driver_profile: { driver_profile_id: 3, user: { name: 'Maya' }, rating: 4.9, vehicle: [{ model: 'Prius', plate_number: 'ABC 123' }] } }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByText(/4\.9 rating/i)).toBeInTheDocument();
    expect(screen.getByText('Prius')).toBeInTheDocument();
    expect(screen.getByText('ABC 123')).toBeInTheDocument();
    await act(async () => testSocket.handlers.get('ride-accepted-41')?.({ trip_id: 7, driver: { id: 3, name: 'Maya' } }));
    expect(screen.getByText(/4\.9 rating/i)).toBeInTheDocument();
    expect(screen.getByText('Prius')).toBeInTheDocument();
    expect(screen.getByText('ABC 123')).toBeInTheDocument();
  });

  it('preserves useful socket ETA through sparse API data and accepts a real newer ETA', async () => {
    api.getRideRequest
      .mockResolvedValueOnce({ data: { ride_request_id: 41, status: 'pending' } })
      .mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: { driver_profile_id: 3, user: { name: 'Maya' } } }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await screen.findByRole('button', { name: /continue waiting/i });
    await act(async () => testSocket.handlers.get('ride-accepted-41')?.({ trip_id: 7, driver: { id: 3, name: 'Maya', eta: 'En route' } }));
    expect(screen.getByText(/ETA: En route/i)).toBeInTheDocument();
    await waitFor(() => expect(api.getRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByText(/ETA: En route/i)).toBeInTheDocument();
    await act(async () => testSocket.handlers.get('ride-accepted-41')?.({ trip_id: 7, driver: { id: 3, name: 'Maya', eta: '3 min' } }));
    expect(screen.getByText(/ETA: 3 min/i)).toBeInTheDocument();
  });

  it('keeps the active session and only offers retry after hydration failure', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('strug_rideshare_active_v1', JSON.stringify({ requestId: 41 }));
    api.getRideRequest.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: { ride_request_id: 41, status: 'pending' } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load trip details/i);
    expect(screen.queryByRole('button', { name: /back|book|change|cancel/i })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('strug_rideshare_active_v1')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('button', { name: /change ride/i })).toBeInTheDocument();
    expect(api.getRideRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reports through help and rebooks by clearing the active session', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onBack = vi.fn();
    sessionStorage.setItem('strug_rideshare_active_v1', JSON.stringify({ requestId: 41 }));
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'completed', active_trip: [{ trip_id: 7, ride_rating: { rating: 5 } }], offered_fare: 18.4 } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={onBack} onNavigate={onNavigate} />);
    expect(await screen.findByText(/thanks for your feedback/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit rating/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /report an issue/i }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('help');
    expect(api.rateRide).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /book again/i }));
    expect(sessionStorage.getItem('strug_rideshare_active_v1')).toBeNull();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps matched cancellation behind fee confirmation and handles failure then success', async () => {
    const user = userEvent.setup();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } });
    api.cancelRide.mockRejectedValueOnce({ response: { data: { message: 'Cancel failed' } } }).mockResolvedValueOnce({ message: 'Ride cancelled. $12.88 refunded.', refund: { refunded: true, amount: 12.88 } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel Ride' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/30% cancellation fee.*70% refund/i);
    await user.click(screen.getByRole('button', { name: /yes, cancel ride/i }));
    expect(await screen.findByText('Cancel failed')).toBeInTheDocument();
    expect(screen.getByText(/driver details unavailable/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /yes, cancel ride/i }));
    expect(await screen.findByText(/\$12\.88 refunded/i)).toBeInTheDocument();
    expect(api.cancelRide).toHaveBeenCalledTimes(2);
  });

  it('returns focus to the cancel trigger when the confirmation dialog is dismissed', async () => {
    const user = userEvent.setup();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: 'Cancel Ride' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /keep ride/i }));
    expect(trigger).toHaveFocus();
  });

  it('focuses, traps, and escapes the cancellation dialog without leaking keys', async () => {
    const user = userEvent.setup();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: 'Cancel Ride' });
    await user.click(trigger);
    const keep = screen.getByRole('button', { name: /keep ride/i });
    const confirm = screen.getByRole('button', { name: /yes, cancel ride/i });
    expect(keep).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(keep).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('retains focus inside the cancellation dialog while cancellation is pending', async () => {
    const user = userEvent.setup();
    let rejectCancellation;
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } });
    api.cancelRide.mockReturnValue(new Promise((_, reject) => { rejectCancellation = reject; }));
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: 'Cancel Ride' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog');
    const confirm = screen.getByRole('button', { name: /yes, cancel ride/i });
    confirm.focus();
    await user.click(confirm);
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveFocus();
    await user.tab();
    expect(dialog).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog).toBeInTheDocument();
    await act(async () => rejectCancellation({ response: { data: { message: 'Cancel failed' } } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancel failed');
    expect(screen.getByRole('button', { name: /keep ride/i })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('opens the OTP as a contained dialog and restores its trigger on Escape', async () => {
    const user = userEvent.setup();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, otp_code: '4821', driver_profile: {} }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    const trigger = await screen.findByRole('button', { name: /view trip code/i });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Trip verification code' });
    const close = within(dialog).getByRole('button', { name: /close/i });
    expect(close).toHaveFocus();
    expect(close).toHaveStyle({ minHeight: '44px' });
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Trip verification code' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each([
    [{ status: 'cancelled', cancellation_reason: 'no_driver_available' }, /tryAgain/i],
    [{ status: 'cancelled', cancellation_reason: 'cancelled_by_passenger' }, /book again/i],
  ])('keeps terminal mobile actions and Back at least 44px %#', async (ride, actionName) => {
    viewport.isMobile = true;
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, ...ride } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: actionName })).toHaveStyle({ minHeight: '44px' });
    expect(screen.getByRole('button', { name: /^back$/i })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
  });

  it('moves one mounted ride from pending through accepted, arrived, ongoing, and completed receipt', async () => {
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'pending' } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /continue waiting/i })).toBeInTheDocument();
    const accepted = testSocket.handlers.get('ride-accepted-41');
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: { user: { name: 'Maya' } } }] } });
    await act(async () => accepted({ trip_id: 7, otp: '4821', driver: { id: 3, name: 'Maya', rating: 4.9, vehicle_type: 'Prius', plate: 'ABC 123' } }));
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.queryByText(/driver has arrived/i)).not.toBeInTheDocument();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_arrived_at: '2026-07-22T12:00:00Z', driver_profile: { user: { name: 'Maya' } } }] } });
    await act(async () => accepted({ trip_id: 7, otp: '4821', driver_arrived_at: '2026-07-22T12:00:00Z', driver: { id: 3, name: 'Maya' } }));
    expect(screen.getByText(/driver has arrived/i)).toBeInTheDocument();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'ongoing', active_trip: [{ trip_id: 7, driver_profile: { user: { name: 'Maya' } } }] } });
    await act(async () => testSocket.handlers.get('trip-started-41')?.({ trip_id: 7 }));
    expect(screen.getByRole('region', { name: /driver and pickup details/i })).toBeInTheDocument();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'completed', active_trip: [{ trip_id: 7, ended_at: '2026-07-22T12:30:00Z', total_fare: 18.4 }], receipt: { ride_request_id: 41, trip_id: 7, pickup_address: 'Union', drop_address: 'Harbour', total_paid: 18.4, currency: 'CAD' } } });
    await act(async () => testSocket.handlers.get('ride-completed-41')?.({ trip_id: 7 }));
    expect(await screen.findByText('Trip Receipt')).toBeInTheDocument();
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matching_started')).toHaveLength(1);
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'matched')).toHaveLength(1);
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'driver_arrived')).toHaveLength(1);
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'ride_started')).toHaveLength(1);
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'ride_completed')).toHaveLength(1);
  });

  it('does not refresh identical untimestamped coordinates but accepts a newer server timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: { current_lat: 43.65, current_long: -79.38, updated_at: new Date().toISOString() } }] } });
    const view = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText(/location updated recently/i)).toBeInTheDocument();
    const location = testSocket.handlers.get('driver-location-updated');
    act(() => location?.({ trip_id: 7, lat: 43.65, lng: -79.38 }));
    act(() => vi.advanceTimersByTime(15_001));
    expect(screen.getByText(/location may be delayed/i)).toBeInTheDocument();
    act(() => location?.({ trip_id: 7, lat: 44, lng: -80, location_updated_at: '2026-07-22T11:59:00Z' }));
    expect(screen.getByText(/location may be delayed/i)).toBeInTheDocument();
    act(() => location?.({ trip_id: 7, lat: 43.65, lng: -79.38, location_updated_at: new Date(Date.now() + 20_000).toISOString() }));
    expect(screen.getByText(/location updated recently/i)).toBeInTheDocument();
    view.unmount();
    vi.useRealTimers();
  });

  it('keeps completed terminal when a stale accepted poll resolves later', async () => {
    let resolveStale;
    api.getRideRequest
      .mockResolvedValueOnce({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } })
      .mockReturnValue(new Promise((resolve) => { resolveStale = resolve; }));
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await screen.findByText(/driver details unavailable/i);
    await act(async () => testSocket.handlers.get('ride-completed-41')?.({ trip_id: 7 }));
    expect(screen.getByRole('button', { name: /book again/i })).toBeInTheDocument();
    await act(async () => resolveStale({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } }));
    expect(screen.getByRole('button', { name: /book again/i })).toBeInTheDocument();
    expect(screen.queryByText(/driver details unavailable/i)).not.toBeInTheDocument();
  });

  it('keeps a socket completion receipt when an older completed poll resolves', async () => {
    let resolveOld;
    api.getRideRequest
      .mockResolvedValueOnce({ data: { ride_request_id: 41, status: 'completed', active_trip: [{ trip_id: 7 }], receipt: { ride_request_id: 41, trip_id: 7, total_fare: 10, currency: 'CAD' } } })
      .mockReturnValue(new Promise((resolve) => { resolveOld = resolve; }));
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await screen.findByText(/\$10\.00/);
    await act(async () => testSocket.handlers.get('ride-completed-41')?.({ receipt: { ride_request_id: 41, trip_id: 7, total_fare: 22, currency: 'CAD' } }));
    expect(screen.getByText(/\$22\.00/)).toBeInTheDocument();
    await act(async () => resolveOld({ data: { ride_request_id: 41, status: 'completed', active_trip: [{ trip_id: 7 }], receipt: { ride_request_id: 41, trip_id: 7, total_fare: 10, currency: 'CAD' } } }));
    expect(screen.getByText(/\$22\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/\$10\.00/)).not.toBeInTheDocument();
  });

  it('shows arrival only from an authoritative driver arrival timestamp', async () => {
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_profile: {} }] } });
    const first = render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await screen.findByText(/driver details unavailable/i);
    expect(screen.queryByText(/driver has arrived/i)).not.toBeInTheDocument();
    first.unmount();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'accepted', active_trip: [{ trip_id: 7, driver_arrived_at: '2026-07-22T12:00:00Z', driver_profile: {} }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByText(/driver has arrived/i)).toBeInTheDocument();
  });

  it.each([
    [{ status: 'cancelled', cancellation_reason: 'no_driver_available' }, /noDriverAvailable/i],
    [{ status: 'cancelled', cancellation_reason: 'cancelled_by_passenger' }, /rideCancelledTitle/i],
  ])('preserves terminal cancellation state %#', async (ride, copy) => {
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, ...ride }, cancellation: { message: 'Refunded $18.40 to your wallet.' } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByText(/Refunded \$18\.40/i)).toBeInTheDocument();
  });

  it.each([
    ['pending', /Contacting nearby drivers/i],
    ['accepted', /Driver details unavailable/i],
    ['ongoing', /Driver details unavailable/i],
  ])('restores %s from the server before showing its action panel', async (status, expected) => {
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status, active_trip: status === 'pending' ? [] : [{ trip_id: 7, otp_code: '4821', driver_profile: {} }] } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    expect(api.getRideRequest).toHaveBeenCalledWith(41);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('cancels a paid pending request before changing ride and stays when cancellation fails', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'pending' } });
    api.cancelRide.mockRejectedValueOnce({ response: { data: { message: 'Cancellation failed' } } });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={onBack} />);
    await user.click(await screen.findByRole('button', { name: /change ride/i }));
    expect(api.cancelRide).toHaveBeenCalledWith(41);
    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cancellation failed');
    api.cancelRide.mockResolvedValueOnce({ refund: { refunded: true } });
    await user.click(screen.getByRole('button', { name: /change ride/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('submits selected tags and typed comment once, then preserves rated state', async () => {
    const user = userEvent.setup();
    api.getRideRequest.mockResolvedValue({ data: { ride_request_id: 41, status: 'completed', active_trip: [{ trip_id: 7 }], offered_fare: 18.4 } });
    api.rateRide.mockResolvedValue({ successful: true });
    render(<RideshareMapView pickup="Union" dropoff="Harbour" requestId={41} onBack={vi.fn()} />);
    await user.click(await screen.findByRole('radio', { name: '5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Safe driving' }));
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'Smooth trip');
    await user.click(screen.getByRole('button', { name: /submit rating/i }));
    await waitFor(() => expect(api.rateRide).toHaveBeenCalledWith({ trip_id: 7, rating: 5, review: 'Safe driving · Smooth trip' }));
    expect(api.rateRide).toHaveBeenCalledOnce();
    expect(await screen.findByText(/thanks for your feedback/i)).toBeInTheDocument();
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'rating_submitted')).toHaveLength(1);
  });
});

describe('RidesharePage booking coordination', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
    viewport.isMobile = false;
    api.getNearbyRides.mockResolvedValue({ data: [{ id: 1, lat: 43.65, lng: -79.38, distance_km: 0.8 }] });
    api.getFareEstimates.mockResolvedValue({ successful: true, estimates: {
      economy: { total: 21 }, comfort: { total: 14 }, premium: { total: 30 },
    } });
  });

  async function enterRoute() {
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Pickup' }), 'Union Station');
    await user.type(screen.getByRole('textbox', { name: 'Dropoff' }), 'Harbourfront');
    return user;
  }

  it('records a page view once and only sends minimized route metadata', async () => {
    const view = render(<RidesharePage />);
    await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    view.rerender(<RidesharePage />);
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'page_viewed')).toHaveLength(1);
    expect(analytics.trackRideEvent).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pickup: expect.anything(), dropoff: expect.anything() }),
    );
  });

  it('sends only the categorical confidence level when pickup is adjusted', async () => {
    render(<RidesharePage userLocation={{ lat: 43.65, long: -79.38 }} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /confirm pickup/i }));
    expect(analytics.trackRideEvent).toHaveBeenCalledWith('pickup_adjusted', { confidence: 'low' });
  });

  it('uses one visible booking panel, chooses the cheapest fare, and preflights into payment review', async () => {
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePage />);
    expect(screen.getByRole('region', { name: 'Book a ride' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Pickup' })).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: 'Dropoff' })).toHaveLength(1);
    const user = await enterRoute();
    const confirm = await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(confirm);
    expect(api.getDriverAvailability).toHaveBeenCalled();
    expect(await screen.findByText('paymentMethod')).toBeInTheDocument();
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'confirmation_started')).toHaveLength(1);
  });

  it('keeps desktop booking and sticky map regions inside the rideshare content area', () => {
    render(<RidesharePage />);
    expect(screen.getByRole('region', { name: /ride booking panel/i })).toHaveStyle({ width: '100%' });
    expect(screen.getByRole('region', { name: /nearby drivers map/i })).toHaveStyle({ position: 'sticky' });
  });

  it('renders a map-first mobile view with a scrollable booking sheet near 37 percent', () => {
    viewport.isMobile = true;
    render(<RidesharePage />);
    expect(screen.getByRole('region', { name: /nearby drivers map/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /ride booking sheet/i })).toHaveStyle({ top: '37%', overflowY: 'auto' });
  });

  it('does not import or render sidebar or global navigation from the inner rideshare page', () => {
    const source = fs.readFileSync(path.resolve('src/pages/Rideshare.jsx'), 'utf8');
    expect(source).not.toMatch(/import\s+.*(?:Sidebar|GlobalNav|Navigation|NavBar)/i);
    expect(source).not.toMatch(/<(?:Sidebar|GlobalNav|Navigation|NavBar)\b/i);
  });

  it('tracks distinct vehicle and confidence transitions while suppressing repeats', async () => {
    render(<RidesharePage userLocation={{ lat: 43.65, long: -79.38 }} />);
    const user = await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await user.click(screen.getByRole('radio', { name: /comfort/i }));
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'vehicle_selected')).toEqual([
      ['vehicle_selected', { vehicle_type: 'premium' }],
      ['vehicle_selected', { vehicle_type: 'comfort' }],
    ]);
    await waitFor(() => expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'pickup_confidence_shown').length).toBeGreaterThanOrEqual(2));
    const confidenceLevels = analytics.trackRideEvent.mock.calls
      .filter(([event]) => event === 'pickup_confidence_shown')
      .map(([, metadata]) => metadata.confidence);
    expect(new Set(confidenceLevels).size).toBe(confidenceLevels.length);
    expect(confidenceLevels).toContain('unknown');
    expect(confidenceLevels).toContain('medium');
  });

  it('keeps the selected booking visible and explains a failed availability preflight', async () => {
    api.getDriverAvailability.mockRejectedValue(new Error('offline'));
    render(<RidesharePage />);
    const user = await enterRoute();
    const confirm = await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(confirm);
    expect(await screen.findByText(/could not verify driver availability/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm comfort · $14.00' })).toBeEnabled());
    expect(screen.queryByText('paymentMethod')).not.toBeInTheDocument();
    expect(analytics.trackRideEvent).not.toHaveBeenCalledWith('confirmation_started', expect.anything());
  });

  it('does not poison confirmation analytics when a failed preflight is retried successfully', async () => {
    api.getDriverAvailability
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: { available: true } });
    render(<RidesharePage />);
    const user = await enterRoute();
    const confirm = await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(confirm);
    expect(await screen.findByText(/could not verify driver availability/i)).toBeInTheDocument();
    expect(analytics.trackRideEvent).not.toHaveBeenCalledWith('confirmation_started', expect.anything());
    await user.click(confirm);
    expect(await screen.findByText('paymentMethod')).toBeInTheDocument();
    expect(analytics.trackRideEvent.mock.calls.filter(([event]) => event === 'confirmation_started')).toEqual([
      ['confirmation_started', { vehicle_type: 'comfort', price_mode: 'standard' }],
    ]);
  });

  it('preserves a deliberate valid ride selection when estimates refresh', async () => {
    api.getFareEstimates
      .mockResolvedValueOnce({ successful: true, estimates: { economy: { total: 21 }, comfort: { total: 14 }, premium: { total: 30 } } })
      .mockResolvedValueOnce({ successful: true, estimates: { economy: { total: 9 }, comfort: { total: 12 }, premium: { total: 35 } } });
    render(<RidesharePage />);
    const user = await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm premium · $30.00' })).toBeEnabled());
    await user.type(screen.getByRole('textbox', { name: 'Dropoff' }), ' West');
    expect(await screen.findByRole('button', { name: 'Confirm premium · $35.00' }, { timeout: 2500 })).toBeEnabled();
  });

  it('ignores an older fare response that resolves after the latest route', async () => {
    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      return { promise, resolve };
    };
    const older = deferred();
    const latest = deferred();
    api.getFareEstimates.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    render(<RidesharePage />);
    const user = await enterRoute();
    await waitFor(() => expect(api.getFareEstimates).toHaveBeenCalledTimes(1), { timeout: 2500 });
    await user.type(screen.getByRole('textbox', { name: 'Dropoff' }), ' West');
    expect(screen.getByRole('button', { name: 'Fare unavailable' })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Updating fare' })).toBeInTheDocument();
    expect(screen.queryByText('$99.00')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getFareEstimates).toHaveBeenCalledTimes(2), { timeout: 2500 });
    latest.resolve({ successful: true, estimates: { economy: { total: 9 }, comfort: { total: 12 }, premium: { total: 35 } } });
    expect(await screen.findByRole('button', { name: 'Confirm economy · $9.00' })).toBeEnabled();
    older.resolve({ successful: true, estimates: { economy: { total: 99 }, comfort: { total: 120 }, premium: { total: 350 } } });
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Confirm economy · $9.00' })).toBeEnabled();
    expect(screen.queryByText('$99.00')).not.toBeInTheDocument();
  });

  it('clears the previous fare immediately when the route is swapped', async () => {
    render(<RidesharePage />);
    const user = await enterRoute();
    expect(await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 })).toBeEnabled();
    api.getFareEstimates.mockReturnValueOnce(new Promise(() => {}));
    await user.click(screen.getByRole('button', { name: 'swapRoute' }));
    expect(screen.getByRole('button', { name: 'Fare unavailable' })).toBeDisabled();
    expect(screen.getByRole('status', { name: 'Updating fare' })).toBeInTheDocument();
    expect(screen.queryByText('$14.00')).not.toBeInTheDocument();
    await waitFor(() => expect(api.getFareEstimates).toHaveBeenCalledTimes(2), { timeout: 2500 });
  });

  it('does not apply a pending fare response after unmount', async () => {
    let resolveFare;
    api.getFareEstimates.mockReturnValueOnce(new Promise((resolve) => { resolveFare = resolve; }));
    const view = render(<RidesharePage />);
    await enterRoute();
    await waitFor(() => expect(api.getFareEstimates).toHaveBeenCalledOnce(), { timeout: 2500 });
    view.unmount();
    resolveFare({ successful: true, estimates: { economy: { total: 9 } } });
    await act(async () => {});
    expect(analytics.trackRideEvent).not.toHaveBeenCalledWith('vehicle_selected', expect.anything());
  });

  it('does not preflight or advance an incomplete scheduled ride', async () => {
    render(<RidesharePage />);
    const user = await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByRole('button', { name: 'Confirm comfort · $14.00' })).toBeDisabled();
    expect(screen.getByText(/choose a schedule date and time/i)).toBeInTheDocument();
    expect(api.getDriverAvailability).not.toHaveBeenCalled();
    expect(analytics.trackRideEvent).not.toHaveBeenCalledWith('confirmation_started', expect.anything());
  });

  it('switches vehicle class in custom-price mode while retaining the offer', async () => {
    render(<RidesharePage />);
    const user = await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: 'Set your own' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Your price' }), '19.50');
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    expect(screen.getByRole('button', { name: 'Confirm premium · $19.50' })).toBeEnabled();
  });

  it('defensively blocks an invalid scheduled payment hold', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="comfort" priceMode="standard"
      fareEstimate={{ total: 14 }} routeMeta={{ status: 'OK', distanceKm: 5, durationMin: 12 }}
      timing="schedule" scheduleDate="" scheduleTime="" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a schedule date and time before paying/i);
    await user.click(screen.getByText('payStrugWallet'));
    const pay = screen.getByRole('button', { name: /Pay \$14\.00 and find drivers/i });
    expect(pay).toBeDisabled();
    await user.click(pay);
    expect(api.createRideRequest).not.toHaveBeenCalled();
  });

  it('automatically disables payment when an unchanged future schedule expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    const view = render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="comfort" priceMode="standard"
      fareEstimate={{ total: 14 }} routeMeta={{ status: 'OK', distanceKm: 5, durationMin: 12 }}
      timing="schedule" scheduleDate="2026-07-22" scheduleTime="12:01" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await act(async () => {});
    fireEvent.click(screen.getByText('payStrugWallet'));
    const pay = screen.getByRole('button', { name: /Pay \$14\.00 and find drivers/i });
    expect(pay).toBeEnabled();
    act(() => vi.advanceTimersByTime(60_001));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a future time/i);
    expect(pay).toBeDisabled();
    view.unmount();
    vi.useRealTimers();
  });

  it('shows the route, selected class, exact authorization, timing, and cancellation terms on review', async () => {
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="economy" priceMode="standard"
      fareEstimate={{ total: 18.4 }} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5.2, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    expect(screen.getByRole('heading', { name: 'Review & Pay' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Route summary' })).toHaveTextContent(/Union Station/);
    expect(screen.getByRole('region', { name: 'Route summary' })).toHaveTextContent(/Harbourfront/);
    expect(screen.getByRole('region', { name: 'Route summary' })).toHaveTextContent(/5\.20 km/);
    expect(screen.getByRole('region', { name: 'Route summary' })).toHaveTextContent(/12 min/);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent(/economy/i);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent('$18.40');
    expect(screen.getByRole('region', { name: 'Timing summary' })).toHaveTextContent(/ride now/i);
    expect(screen.getByRole('region', { name: 'Cancellation terms' })).toHaveTextContent(/full refund before a driver accepts/i);
    expect(screen.getByRole('region', { name: 'Cancellation terms' })).toHaveTextContent(/30% fee.*70% refund/i);
    expect(screen.getByRole('group', { name: 'Payment method' })).toHaveTextContent(/PayPal is temporarily unavailable for rideshare/i);
    expect(screen.queryByRole('radio', { name: /paypal/i })).not.toBeInTheDocument();
  });

  it('retries a recoverable payment error against the same ride hold and transitions only after success', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    api.createRideRequest.mockResolvedValue({ ride_request_id: 44 });
    api.confirmRidePayment
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Card declined' } } })
      .mockResolvedValueOnce({ successful: true });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="premium" priceMode="standard"
      fareEstimate={{ total: 18.4 }} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5.2, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={onConfirm}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    const pay = screen.getByRole('button', { name: /\$18\.40/ });
    await user.click(pay);
    expect(await screen.findByRole('alert')).toHaveTextContent('Card declined');
    expect(screen.getByRole('heading', { name: 'Review & Pay' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent(/premium/i);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent('$18.40');
    expect(api.createRideRequest).toHaveBeenCalledTimes(1);
    expect(api.confirmRidePayment).toHaveBeenCalledTimes(1);
    expect(api.confirmRidePayment).toHaveBeenLastCalledWith(44, { payment_method: 'wallet', amount: 18.4 });
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(pay);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(44));
    expect(api.createRideRequest).toHaveBeenCalledTimes(1);
    expect(api.confirmRidePayment).toHaveBeenCalledTimes(2);
    expect(api.confirmRidePayment).toHaveBeenLastCalledWith(44, { payment_method: 'wallet', amount: 18.4 });
  });

  it('disables standard payment when the live fare is missing and creates no hold', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="comfort" priceMode="standard"
      fareEstimate={{}} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    expect(screen.getByText(/live fare is unavailable/i)).toBeInTheDocument();
    const pay = screen.getByRole('button', { name: /amount unavailable/i });
    expect(pay).toBeDisabled();
    await user.click(pay);
    expect(api.createRideRequest).not.toHaveBeenCalled();
  });

  it('reviews the exact validated custom offer for the selected vehicle', () => {
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="suv" priceMode="setprice" userPrice="23.75"
      fareEstimate={null} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" referralCode="FRIEND" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent(/suv/i);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent('$23.75');
    expect(screen.getByText('FRIEND')).toBeInTheDocument();
  });

  it.each([
    ['below minimum', '0.99'],
    ['malformed numeric prefix', '19abc'],
    ['infinite', 'Infinity'],
    ['negative', '-3'],
  ])('disables a %s custom offer without creating a hold', async (_label, userPrice) => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="suv" priceMode="setprice" userPrice={userPrice}
      fareEstimate={null} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    expect(screen.getByText(/offer of at least/i)).toBeInTheDocument();
    const pay = screen.getByRole('button', { name: /amount unavailable/i });
    expect(pay).toBeDisabled();
    await user.click(pay);
    expect(api.createRideRequest).not.toHaveBeenCalled();
  });

  it('rounds a standard server fare to canonical cents for display, hold, and confirmation', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    api.createRideRequest.mockResolvedValue({ ride_request_id: 71 });
    api.confirmRidePayment.mockResolvedValue({ successful: true });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="economy" priceMode="standard"
      fareEstimate={{ total: 18.405 }} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent('$18.41');
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    await user.click(screen.getByRole('button', { name: /Pay \$18\.41/ }));
    await waitFor(() => expect(api.confirmRidePayment).toHaveBeenCalled());
    expect(api.createRideRequest).toHaveBeenCalledWith(expect.objectContaining({ estimated_fare: 18.41 }));
    expect(api.confirmRidePayment).toHaveBeenCalledWith(71, { payment_method: 'wallet', amount: 18.41 });
  });

  it('blocks a positive standard fare below the $0.50 minimum without creating or confirming', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="economy" priceMode="standard"
      fareEstimate={{ total: 0.49 }} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    expect(screen.getByText(/live fare is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /amount unavailable/i })).toBeDisabled();
    expect(api.createRideRequest).not.toHaveBeenCalled();
    expect(api.confirmRidePayment).not.toHaveBeenCalled();
  });

  it('accepts the exact $0.50 standard boundary as the canonical payment amount', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    api.createRideRequest.mockResolvedValue({ ride_request_id: 73 });
    api.confirmRidePayment.mockResolvedValue({ successful: true });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="economy" priceMode="standard"
      fareEstimate={{ total: 0.5 }} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    await user.click(screen.getByRole('button', { name: /Pay \$0\.50/ }));
    await waitFor(() => expect(api.confirmRidePayment).toHaveBeenCalled());
    expect(api.createRideRequest).toHaveBeenCalledWith(expect.objectContaining({ estimated_fare: 0.5 }));
    expect(api.confirmRidePayment).toHaveBeenCalledWith(73, { payment_method: 'wallet', amount: 0.5 });
  });

  it('rejects a custom offer with more than two fractional digits and explains the precision limit', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="suv" priceMode="setprice" userPrice="1.005"
      fareEstimate={null} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    expect(screen.getByText(/no more than 2 decimal places/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /amount unavailable/i })).toBeDisabled();
    expect(api.createRideRequest).not.toHaveBeenCalled();
  });

  it('uses the canonical custom offer for display, hold, and confirmation', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    api.createRideRequest.mockResolvedValue({ ride_request_id: 72 });
    api.confirmRidePayment.mockResolvedValue({ successful: true });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="suv" priceMode="setprice" userPrice="19.50"
      fareEstimate={null} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    expect(screen.getByRole('region', { name: 'Ride and authorization' })).toHaveTextContent('$19.50');
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    await user.click(screen.getByRole('button', { name: /Pay \$19\.50/ }));
    await waitFor(() => expect(api.confirmRidePayment).toHaveBeenCalled());
    expect(api.createRideRequest).toHaveBeenCalledWith(expect.objectContaining({ offered_price: 19.5, estimated_fare: 19.5 }));
    expect(api.confirmRidePayment).toHaveBeenCalledWith(72, { payment_method: 'wallet', amount: 19.5 });
  });

  it.each([NaN, Infinity, -Infinity])('disables a nonfinite standard fare total (%s)', async (total) => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePaymentView
      pickup="Union Station" dropoff="Harbourfront" selectedType="economy" priceMode="standard"
      fareEstimate={{ total }} routeMeta={{ status: 'OK', source: 'test', distanceKm: 5, durationMin: 12 }}
      timing="now" onBack={vi.fn()} onConfirm={vi.fn()}
    />);
    await user.click(screen.getByRole('radio', { name: /payStrugWallet/i }));
    expect(screen.getByText(/live fare is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /amount unavailable/i })).toBeDisabled();
    expect(api.createRideRequest).not.toHaveBeenCalled();
  });

  it('returns to booking without losing the controlled route, class, or fare selection', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePage />);
    await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await user.click(screen.getByRole('button', { name: 'Confirm premium · $30.00' }));
    expect(await screen.findByRole('heading', { name: 'Review & Pay' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByRole('textbox', { name: 'Pickup' })).toHaveValue('Union Station');
    expect(screen.getByRole('textbox', { name: 'Dropoff' })).toHaveValue('Harbourfront');
    expect(screen.getByRole('radio', { name: /premium/i })).toBeChecked();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm premium · $30.00' })).toBeEnabled(), { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: 'Confirm premium · $30.00' }));
    expect(await screen.findByRole('region', { name: 'Ride and authorization' })).toHaveTextContent(/premium.*\$30\.00/i);
  });

  it('preserves a valid scheduled local time through review and Back', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePage />);
    await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    const future = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    await user.type(screen.getByLabelText('Schedule date'), date);
    await user.type(screen.getByLabelText('Schedule time'), '14:30');
    await user.click(screen.getByRole('button', { name: 'Confirm comfort · $14.00' }));
    const timingSummary = await screen.findByRole('region', { name: 'Timing summary' });
    expect(timingSummary).toHaveTextContent(/14:30|2:30/);
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByLabelText('Schedule date')).toHaveValue(date);
    expect(screen.getByLabelText('Schedule time')).toHaveValue('14:30');
  });

  it('preserves custom offer, selected vehicle, and referral disclosure through review and Back', async () => {
    const user = userEvent.setup();
    api.getDriverAvailability.mockResolvedValue({ data: { available: true } });
    render(<RidesharePage />);
    await enterRoute();
    await screen.findByRole('button', { name: 'Confirm comfort · $14.00' }, { timeout: 2500 });
    await user.click(screen.getByRole('button', { name: 'Set your own' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Your price' }), '19.50');
    await user.click(screen.getByRole('radio', { name: /premium/i }));
    await user.click(screen.getByRole('button', { name: 'Have a referral code? Add it here' }));
    await user.type(screen.getByRole('textbox', { name: 'Referral code' }), 'FRIEND');
    await user.click(screen.getByRole('button', { name: 'Confirm premium · $19.50' }));
    expect(await screen.findByRole('region', { name: 'Ride and authorization' })).toHaveTextContent(/premium.*\$19\.50/i);
    expect(screen.getByText('FRIEND')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(screen.getByRole('spinbutton', { name: 'Your price' })).toHaveValue(19.5);
    expect(screen.getByRole('radio', { name: /premium/i })).toBeChecked();
    expect(screen.getByText(/Referral code:/)).toHaveTextContent('FRIEND');
    await user.click(screen.getByRole('button', { name: 'Have a referral code? Add it here' }));
    expect(screen.getByRole('textbox', { name: 'Referral code' })).toHaveValue('FRIEND');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm premium · $19.50' })).toBeEnabled(), { timeout: 2500 });
  });
});
