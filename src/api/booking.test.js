/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import client from './client.js';
import {
  getMyBookingListings,
  getBookings,
  getBookingListings,
  getBookingListing,
  submitBookingReview,
  getListingReviews,
  createBookingReview,
} from './booking.js';
import { buildTempStayListingsQuery } from '../utils/tempstayBrowseFilters.js';

describe('booking API isolation params', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.get.mockResolvedValue({ data: { successful: true, data: [] } });
    client.post.mockResolvedValue({ data: { successful: true, data: {} } });
  });

  it('getMyBookingListings forwards vertical query', async () => {
    await getMyBookingListings({ vertical: 'tempstay' });
    expect(client.get).toHaveBeenCalledWith('/booking/listings/mine', {
      params: { vertical: 'tempstay' },
    });
  });

  it('getBookings forwards role + vertical for host portal', async () => {
    await getBookings({ role: 'host', vertical: 'tempstay' });
    expect(client.get).toHaveBeenCalledWith('/booking/bookings', {
      params: { role: 'host', vertical: 'tempstay' },
    });
  });

  it('getBookingListings forwards browse filter params', async () => {
    const params = buildTempStayListingsQuery({ q: 'cabin', minPrice: 90, maxPrice: 180, minGuests: 2 });
    await getBookingListings(params);
    expect(client.get).toHaveBeenCalledWith('/booking/listings', {
      params: {
        vertical: 'tempstay',
        limit: 100,
        q: 'cabin',
        min_price: 90,
        max_price: 180,
        min_guests: 2,
      },
    });
  });

  it('submitBookingReview posts rating to booking-engine review endpoint', async () => {
    await submitBookingReview(42, { rating: 5, comment: 'Great visit' });
    expect(client.post).toHaveBeenCalledWith('/booking/bookings/42/review', {
      rating: 5,
      comment: 'Great visit',
    });
  });

  it('getListingReviews hits public listing reviews', async () => {
    await getListingReviews(7);
    expect(client.get).toHaveBeenCalledWith('/booking/listings/7/reviews');
  });

  it('createBookingReview posts rating payload', async () => {
    await createBookingReview(42, { rating: 5, review: 'Great stay' });
    expect(client.post).toHaveBeenCalledWith('/booking/bookings/42/review', {
      rating: 5,
      review: 'Great stay',
    });
  });

  it('getBookingListing forwards optional vertical for deep-link isolation', async () => {
    await getBookingListing(9, { vertical: 'tempstay' });
    expect(client.get).toHaveBeenCalledWith('/booking/listings/9', {
      params: { vertical: 'tempstay' },
    });
  });

  it('getBookingListing works without params', async () => {
    await getBookingListing(9);
    expect(client.get).toHaveBeenCalledWith('/booking/listings/9', {
      params: undefined,
    });
  });
});
