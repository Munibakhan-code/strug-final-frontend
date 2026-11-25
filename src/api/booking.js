import client from './client';
import { getCheckoutReferralCode } from './referral.js';

// Shared Booking Engine API client — vertical-agnostic over the Airbnb-style
// verticals (tempstay, hotel, venue, equipment, vehicle, lesson, event,
// experience, celebrity, artist, reservation). Pass `vertical` to scope.

// ── Listings ────────────────────────────────────────────────────────────────
export const getBookingListings = (params) =>
  client.get('/booking/listings', { params }).then((r) => r.data);
export const getMyBookingListings = (params) =>
  client.get('/booking/listings/mine', { params }).then((r) => r.data);
export const getBookingListing = (id, params) =>
  client.get(`/booking/listings/${id}`, { params }).then((r) => r.data);
export const createBookingListing = (data) =>
  client.post('/booking/listings', data).then((r) => r.data);
export const updateBookingListing = (id, data) =>
  client.put(`/booking/listings/${id}`, data).then((r) => r.data);
export const deleteBookingListing = (id) =>
  client.delete(`/booking/listings/${id}`).then((r) => r.data);

// ── Availability ──────────────────────────────────────────────────────────--
export const getListingAvailability = (id, params = {}) => {
  const { signal, ...query } = params;
  return client.get(`/booking/listings/${id}/availability`, { params: query, signal }).then((r) => r.data);
};
export const setListingAvailability = (id, slots) =>
  client.post(`/booking/listings/${id}/availability`, { slots }).then((r) => r.data);
export const deleteListingAvailability = (listingId, slotId) =>
  client.delete(`/booking/listings/${listingId}/availability/${slotId}`).then((r) => r.data);

/** OpenTable-style slots for a restaurant listing on a date + party size. */
export const getReservationSlots = (listingId, { date, party_size } = {}) =>
  client
    .get(`/booking/listings/${listingId}/reservation-slots`, {
      params: { date, party_size },
    })
    .then((r) => r.data);

// ── Quote (server-authoritative price + availability check, no write) ─────────
export const getBookingQuote = (data) =>
  client.post('/booking/quote', data).then((r) => r.data);

// ── Bookings ────────────────────────────────────────────────────────────────
/** Attach session checkout Referral code when the caller did not pass one. */
function withCheckoutReferral(data = {}) {
  if (data.referral_code) return data;
  const code = getCheckoutReferralCode();
  return code ? { ...data, referral_code: code } : data;
}

export const createBooking = (data) =>
  client.post('/booking/bookings', withCheckoutReferral(data)).then((r) => r.data);
export const getBookings = (params) =>
  client.get('/booking/bookings', { params }).then((r) => r.data);
export const getBooking = (id) =>
  client.get(`/booking/bookings/${id}`).then((r) => r.data);
export const acceptBooking = (id) =>
  client.put(`/booking/bookings/${id}/accept`).then((r) => r.data);
export const declineBooking = (id) =>
  client.put(`/booking/bookings/${id}/decline`).then((r) => r.data);
export const cancelBooking = (id, reason) =>
  client.put(`/booking/bookings/${id}/cancel`, { reason }).then((r) => r.data);
export const checkInBooking = (id) =>
  client.patch(`/booking/bookings/${id}/check-in`).then((r) => r.data);
export const completeBooking = (id) =>
  client.patch(`/booking/bookings/${id}/complete`).then((r) => r.data);

// ── Reviews (booking engine — preferred over unmounted appointment_rating routes) ─
/** Guest rates a completed booking. Body: { rating: 1-5, review|comment?: string } */
export const submitBookingReview = (id, { rating, review, comment } = {}) =>
  client
    .post(`/booking/bookings/${id}/review`, {
      rating,
      ...(review != null ? { review } : {}),
      ...(comment != null ? { comment } : {}),
    })
    .then((r) => r.data);

/** Guest review after host completes the stay (one per booking). */
export const createBookingReview = (id, data) =>
  client.post(`/booking/bookings/${id}/review`, data).then((r) => r.data);

export const getListingReviews = (listingId, params) =>
  (params
    ? client.get(`/booking/listings/${listingId}/reviews`, { params })
    : client.get(`/booking/listings/${listingId}/reviews`)
  ).then((r) => r.data);

/** Host dashboard: all guest reviews across the host's listings for a vertical. */
export const getHostBookingReviews = (params) =>
  client.get('/booking/host/me/reviews', { params }).then((r) => r.data);

// ── Payment ────────────────────────────────────────────────────────────────-
// Server sets the charged amount from booking.total — the client can't influence it.
export const createBookingIntent = (id) =>
  client.post(`/booking/bookings/${id}/intent`).then((r) => r.data);

// ── Hotel room types ────────────────────────────────────────────────────────
export const getHotelRooms = (listingId) =>
  client.get(`/booking/listings/${listingId}/rooms`).then((r) => r.data);
export const createHotelRoom = (listingId, data) =>
  client.post(`/booking/listings/${listingId}/rooms`, data).then((r) => r.data);
export const updateHotelRoom = (listingId, roomId, data) =>
  client.put(`/booking/listings/${listingId}/rooms/${roomId}`, data).then((r) => r.data);
export const deleteHotelRoom = (listingId, roomId) =>
  client.delete(`/booking/listings/${listingId}/rooms/${roomId}`).then((r) => r.data);
// Optional per-date overrides (block / available / price). Not required to seed bookable
// nights — checkHotelRoomAvailability falls back to room_type.quantity when no row exists.
export const setHotelRoomInventory = (listingId, roomId, slots) =>
  client.post(`/booking/listings/${listingId}/rooms/${roomId}/inventory`, { slots }).then((r) => r.data);
