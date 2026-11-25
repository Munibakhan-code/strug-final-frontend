/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  canCancelEventTicket,
  mapBookingToEventTicket,
  mapGuestBookingsToEventTickets,
  filterEventTicketsByBucket,
  eventTicketBucket,
} from './eventTickets.js';

describe('eventTickets', () => {
  it('cancel eligibility matches active statuses', () => {
    expect(canCancelEventTicket('confirmed')).toBe(true);
    expect(canCancelEventTicket('awaiting_host')).toBe(true);
    expect(canCancelEventTicket('requested')).toBe(true);
    expect(canCancelEventTicket('in_progress')).toBe(true);
    expect(canCancelEventTicket('cancelled')).toBe(false);
    expect(canCancelEventTicket('completed')).toBe(false);
    expect(canCancelEventTicket('declined')).toBe(false);
  });

  it('maps engine booking to ticket card', () => {
    const ticket = mapBookingToEventTicket({
      booking_id: 42,
      status: 'confirmed',
      start_date: '2026-10-10',
      end_date: null,
      quantity: 3,
      total: 75,
      vertical: 'event',
      booking_listing: { booking_listing_id: 9, title: 'Jazz Night', location: 'Toronto' },
    });
    expect(ticket).toMatchObject({
      booking_id: 42,
      listing_id: 9,
      title: 'Jazz Night',
      location: 'Toronto',
      event_date: '2026-10-10',
      start_date: '2026-10-10',
      quantity: 3,
      total: 75,
      can_cancel: true,
      bucket: 'upcoming',
    });
  });

  it('drops non-event rows when mapping guest list', () => {
    const tickets = mapGuestBookingsToEventTickets([
      { booking_id: 1, vertical: 'event', status: 'confirmed', booking_listing: { title: 'Show' } },
      { booking_id: 2, vertical: 'venue', status: 'confirmed', booking_listing: { title: 'Hall' } },
      { booking_id: 3, vertical: 'tempstay', status: 'confirmed', booking_listing: { title: 'Cabin' } },
    ]);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].booking_id).toBe(1);
  });

  it('buckets cancelled, declined, completed, and past events correctly', () => {
    expect(eventTicketBucket('cancelled')).toBe('cancelled');
    expect(eventTicketBucket('declined')).toBe('cancelled');
    expect(eventTicketBucket('completed')).toBe('past');
    expect(eventTicketBucket('confirmed', { now: new Date('2026-10-01') }, '2026-09-01')).toBe('past');
    expect(eventTicketBucket('confirmed', { now: new Date('2026-08-01') }, '2026-09-01')).toBe('upcoming');
    expect(filterEventTicketsByBucket([
      { booking_id: 1, bucket: 'upcoming' },
      { booking_id: 2, bucket: 'cancelled' },
    ], 'cancelled')).toHaveLength(1);
  });
});
