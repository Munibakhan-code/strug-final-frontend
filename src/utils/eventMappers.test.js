/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  mapBookingListingToEvent,
  mapBookingListingsToEvents,
  resolveEventAttending,
  maxEventQuantity,
  eventStartDateISO,
} from './eventMappers.js';

describe('eventMappers', () => {
  it('maps listing fields, images, and organiser without inventing attending', () => {
    const e = mapBookingListingToEvent({
      booking_listing_id: 11,
      title: 'Jazz Night',
      price: 25,
      location: 'Toronto',
      description: 'Live quartet.',
      owner_id: 4,
      images: ['https://cdn.example/jazz.jpg'],
      attributes: {
        category: 'Music',
        venue_name: 'The Rex',
        date: '2026-09-12',
        time: '8:00 PM',
        featured: true,
        organiser: 'Maya',
        attending: 48,
      },
    });
    expect(e).toMatchObject({
      id: 11,
      title: 'Jazz Night',
      category: 'Music',
      venue: 'The Rex',
      date: '2026-09-12',
      time: '8:00 PM',
      price: 25,
      location: 'Toronto',
      description: 'Live quartet.',
      attending: 48,
      organiser: 'Maya',
      hostId: 4,
      featured: true,
      image: 'https://cdn.example/jazz.jpg',
    });
    expect(e.avatar).toBe('M');
  });

  it('falls back to event_type when category is missing', () => {
    const e = mapBookingListingToEvent({
      booking_listing_id: 2,
      title: 'Open Mic',
      price: 0,
      attributes: { event_type: 'Comedy' },
      images: [],
    });
    expect(e.category).toBe('Comedy');
    expect(e.eventType).toBe('Comedy');
    expect(e.price).toBe(0);
  });

  it('does not invent attending, organiser, or featured', () => {
    const e = mapBookingListingToEvent({
      booking_listing_id: 3,
      title: 'Meetup',
      price: 0,
      attributes: {},
      images: [],
    });
    expect(e.attending).toBeNull();
    expect(e.organiser).toBe('');
    expect(e.hostId).toBeNull();
    expect(e.featured).toBe(false);
    expect(e.image).toBeNull();
    expect(e.description).toBeNull();
  });

  it('resolveEventAttending ignores zero and junk', () => {
    expect(resolveEventAttending({ attending: 12 })).toBe(12);
    expect(resolveEventAttending({ attendee_count: 3 })).toBe(3);
    expect(resolveEventAttending({ attending: 0 })).toBeNull();
    expect(resolveEventAttending({})).toBeNull();
    expect(resolveEventAttending({ attending: 'nope' })).toBeNull();
  });

  it('caps ticket quantity at 10 unless listing has a smaller tickets_left', () => {
    expect(maxEventQuantity({})).toBe(10);
    expect(maxEventQuantity({ tickets_left: 3 })).toBe(3);
    expect(maxEventQuantity({ tickets_left: 99 })).toBe(10);
    expect(maxEventQuantity({}, 4)).toBe(4);
  });

  it('normalizes event dates to YYYY-MM-DD for the booking engine', () => {
    expect(eventStartDateISO('2026-09-12')).toBe('2026-09-12');
    expect(eventStartDateISO('2026-09-12T20:00')).toBe('2026-09-12');
    expect(eventStartDateISO('')).toBeUndefined();
    expect(eventStartDateISO(null)).toBeUndefined();
  });

  it('maps lists and drops null rows', () => {
    const events = mapBookingListingsToEvents([
      { booking_listing_id: 1, title: 'A', price: 10, attributes: {}, images: [] },
      null,
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(1);
  });
});
