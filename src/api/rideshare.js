import client from './client';

// Ride requests
export const getNearbyRides = (params) => client.get('/ride-request/nearby', { params }).then(r => r.data);
export function normalizeNearbyDrivers(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.drivers)) return payload.drivers;
  return [];
}
export const getDriverAvailability = () =>
  client.get('/ride-request/drivers/availability').then((r) => r.data);
export function parseNearbyDrivers(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.drivers)) return payload.drivers;
  return [];
}
export const getRideEstimate = (params) => client.get('/ride-request/estimate', { params }).then(r => r.data);
function withOptionalStops(payload, stops = []) {
  return Array.isArray(stops) && stops.length ? { ...payload, stops } : payload;
}

export const getFareEstimate = (pickup, dropoff, vehicle_type, stops = []) =>
  client.post('/ride-request/fare-estimate', withOptionalStops({ pickup, dropoff, vehicle_type }, stops)).then(r => r.data);
export const getFareEstimates = (pickup, dropoff, coords, stops = []) =>
  client.post('/ride-request/fare-estimates', withOptionalStops({ pickup, dropoff, ...coords }, stops)).then(r => r.data);
export const getIncomingRideRequests = () => client.get('/ride-request/driver/incoming').then(r => r.data);
export const createRideRequest = (data) => client.post('/ride-request/', data).then(r => r.data);
export const confirmRidePayment = (rideRequestId, data) =>
  client.post(`/ride-request/${rideRequestId}/confirm-payment`, data).then((r) => r.data);
export const getRideRequest = (id) => client.get(`/ride-request/${id}`).then((r) => r.data);
export const updateRideStops = (id, stops) =>
  client.put(`/ride-request/${id}/stops`, { stops }).then((r) => r.data);
export const updateRideStopStatus = (rideRequestId, rideStopId, status, driver_profile_id) =>
  client.patch(`/ride-request/${rideRequestId}/stops/${rideStopId}/status`, { status, driver_profile_id }).then((r) => r.data);
export const decideRideStopChange = (rideRequestId, changeId, data = {}) =>
  client.patch(`/ride-request/${rideRequestId}/stop-changes/${changeId}`, data).then((r) => r.data);
export const cancelRide = (id) => client.put(`/ride-request/${id}/cancel`).then(r => r.data);
export const acceptRide = (id, driver_profile_id) =>
  client.put(`/ride-request/${id}/accept`, { driver_profile_id }).then(r => r.data);
export const declineRide = (id, driver_profile_id) =>
  client.put(`/ride-request/${id}/decline`, { driver_profile_id }).then(r => r.data);
export const verifyRideOtp = (tripId, otp) =>
  client.patch(`/active-trip/${tripId}/verify-otp`, { otp }).then((r) => r.data);
export const getMyRides = (passengerId, params) =>
  client.get(`/ride-request/passenger/${passengerId}`, { params }).then((r) => r.data);

export const getPassengerRideHistory = (params) =>
  client.get('/ride-request/passenger/me', { params }).then((r) => r.data);

export function parsePassengerRideHistoryItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

/** Parse GET /ride-request/:id — ride row plus optional receipt and cancellation summary. */
export function parseRideRequestResponse(raw) {
  const ride = raw?.data ?? raw;
  const receipt = raw?.receipt ?? ride?.receipt ?? null;
  const cancellation = raw?.cancellation ?? null;
  return { ride, receipt, cancellation };
}

/** System cancel reasons when nobody accepts — distinct from passenger cancel. */
export const SYSTEM_NO_DRIVER_REASONS = new Set([
  'no_driver_available',
  'no_driver_found',
  'all_drivers_declined',
]);

export function isSystemNoDriverReason(reason) {
  return SYSTEM_NO_DRIVER_REASONS.has(String(reason || ''));
}

function formatReceiptDateLocal(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return null;
  }
}

function formatPaymentMethodLabel(method) {
  const m = (method || '').toLowerCase();
  if (m === 'card') return 'Credit / Debit Card';
  if (m === 'wallet') return 'Strug Wallet';
  if (m === 'cash') return 'Cash';
  if (m === 'paypal') return 'PayPal';
  return method || '—';
}

/** Map server receipt payload → in-app TripReceiptSummary shape. */
export function mapRideReceiptFromServer(receipt, fallbacks = {}) {
  if (!receipt) return null;
  return {
    rideId: receipt.ride_request_id ?? null,
    tripId: receipt.trip_id ?? null,
    completedAtLabel:
      receipt.completed_at_label ?? formatReceiptDateLocal(receipt.completed_at),
    pickup: receipt.pickup_address ?? fallbacks.pickup ?? 'Pickup',
    dropoff: receipt.drop_address ?? fallbacks.dropoff ?? 'Dropoff',
    driverName: receipt.driver_name ?? null,
    vehicleType: receipt.vehicle_type ?? null,
    distanceKm: receipt.distance_km ?? null,
    total: receipt.total_fare ?? null,
    currency: receipt.currency ?? 'CAD',
    paymentMethod:
      receipt.payment_method_label ?? formatPaymentMethodLabel(receipt.payment_method),
  };
}

// Active trips
export const getActiveTrip = () => client.get('/active-trip/').then(r => r.data);
export const markTripArrived = (tripId) =>
  client.patch(`/active-trip/${tripId}/arrived`).then((r) => r.data);
export const updateTripStatus = (tripId, status) => client.patch(`/active-trip/${tripId}/status`, { status }).then(r => r.data);
export const completeTrip = (tripId) => client.patch(`/active-trip/${tripId}/complete`).then(r => r.data);

/** Map GET /active-trip row to driver dashboard active-ride state. */
export function mapDriverActiveTrip(trip) {
  if (!trip || trip.ended_at) return null;
  const ride = trip.ride_request;
  if (!ride) return null;
  const rideStatus = (ride.status || '').toLowerCase();
  if (rideStatus !== 'accepted' && rideStatus !== 'ongoing') return null;

  const storedPayout = trip.driver_payout != null ? parseFloat(trip.driver_payout) : null;
  const driverPay =
    storedPayout != null && !Number.isNaN(storedPayout) ? storedPayout : null;

  let stage = 'accepted';
  if (rideStatus === 'ongoing') stage = 'ongoing';
  else if (trip.driver_arrived_at) stage = 'arrived';

  return {
    type: 'ride',
    requestId: trip.request_id ?? ride.ride_request_id,
    tripId: trip.trip_id,
    otp: trip.otp_code ?? null,
    stage,
    passenger: ride.user?.name ?? 'Customer',
    pickup: ride.pickup_address ?? 'Pickup',
    dropoff: ride.drop_address ?? 'Dropoff',
    fare:
      driverPay != null && !Number.isNaN(driverPay)
        ? `$${driverPay.toFixed(2)}`
        : '—',
    driverArrivedAt: trip.driver_arrived_at ?? null,
    startedAt: trip.started_at ?? null,
  };
}

/** Pick the driver's current open trip from GET /active-trip list. */
export function pickDriverOpenTrip(raw) {
  const trips = Array.isArray(raw) ? raw : (raw?.data ?? []);
  return trips
    .filter(
      (t) =>
        !t.ended_at &&
        t.ride_request &&
        ['accepted', 'ongoing'].includes((t.ride_request.status || '').toLowerCase()),
    )
    .sort((a, b) => (b.trip_id ?? 0) - (a.trip_id ?? 0))[0] ?? null;
}

// Driver
export const getDriverProfile = () => client.get('/driver-profile/me').then(r => r.data);
export const getTripHistory = (params) =>
  client.get('/driver-profile/trips/history', { params }).then((r) => r.data);
export const getTodayEarnings = () => client.get('/driver-profile/earnings/today').then((r) => r.data);
export const getDriverEarningsBreakdown = () =>
  client.get('/driver-profile/me/earnings/breakdown').then((r) => r.data?.data ?? r.data);

/** Normalize GET /driver-profile/earnings/today for dashboard widgets. */
export function normalizeTodayEarnings(res) {
  const stats = res?.stats ?? res?.data?.stats ?? null;
  if (!stats) return null;
  const net = stats.driver_earnings != null
    ? parseFloat(stats.driver_earnings)
    : 0;
  return {
    ...stats,
    net_earnings: net,
    total_trips: Number(stats.total_trips ?? 0),
    total_distance_km: parseFloat(stats.total_distance_km ?? 0),
  };
}

export function mapDriverTripHistoryRow(trip) {
  const rr = trip?.ride_request;
  const netRaw = trip?.driver_payout;
  const net = netRaw != null && !Number.isNaN(Number(netRaw))
    ? parseFloat(Number(netRaw).toFixed(2))
    : null;
  const endedAt = trip?.ended_at ? new Date(trip.ended_at) : null;
  return {
    id: trip?.trip_id != null ? `#${trip.trip_id}` : '—',
    tripId: trip?.trip_id ?? null,
    from: rr?.pickup_address ?? 'Pickup',
    to: rr?.drop_address ?? 'Dropoff',
    fare: net != null ? `$${net.toFixed(2)}` : '—',
    netFare: net,
    time: endedAt
      ? endedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : '—',
    status: 'Completed',
    passengerName: rr?.user?.name ?? 'Rider',
    distanceKm: trip?.actual_distance_km != null
      ? parseFloat(Number(trip.actual_distance_km).toFixed(2))
      : null,
  };
}

export function normalizeTripHistory(res) {
  const rows = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
  return {
    trips: rows.map(mapDriverTripHistoryRow),
    totalRecords: res?.pagination?.total_records ?? rows.length,
  };
}
export const setDriverStatus = (isOnline, lat, lng) => client.patch('/driver-profile/me/status', { is_online: isOnline, current_lat: lat, current_long: lng }).then(r => r.data);
export const setDriverPreferences = (prefs) => client.patch('/driver-profile/me/preferences', prefs).then(r => r.data);
export const getIncomingDeliveryOffers = () => client.get('/driver-profile/me/incoming-delivery-offers').then(r => r.data);

// Carpool
export const searchCarpoolOffers = (params) => client.get('/carpool-offer/search', { params }).then(r => r.data);
export const createCarpoolOffer = (data) => client.post('/carpool-offer/', data).then(r => r.data);
export const bookCarpool = (data) => client.post('/carpool-booking/', data).then(r => r.data);
export const getMyCarpoolBookings = () => client.get('/carpool-booking/me').then(r => r.data);

// Rating
export const rateRide = (data) => client.post('/ride-rating/', data).then(r => r.data);
export const rateRider = (data) => client.post('/rider-rating/', data).then(r => r.data);

// Tipping — a fresh Stripe charge per trip, credited 100% to the driver.
export const createTipIntent = (tripId, amount) =>
  client.post(`/ride-tip/${tripId}/create-intent`, { amount }).then(r => r.data);
export const confirmTip = (tripId, paymentIntentId) =>
  client.post(`/ride-tip/${tripId}/confirm`, { payment_intent_id: paymentIntentId }).then(r => r.data);
