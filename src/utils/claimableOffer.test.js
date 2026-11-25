import { describe, it, expect } from 'vitest';
import { isClaimableOffer, isInlineAcceptableRide } from './claimableOffer.js';

const rideOffer = {
  vertical: 'rideshare', urgency: 'actionable', type: 'ride.offer',
  entity_type: 'ride_request', entity_id: 3,
};

// The exact notification shape that routes/driver-safety-routes.js used to emit as 'actionable'.
const sosAck = {
  vertical: 'rideshare', urgency: 'actionable', type: 'sos.acknowledged',
  entity_type: 'trip_sos_incident', entity_id: 3,
};

describe('isClaimableOffer', () => {
  it('accepts a real ride offer', () => {
    expect(isClaimableOffer(rideOffer)).toBe(true);
  });

  it('rejects an SOS acknowledgement even when it is marked actionable', () => {
    expect(isClaimableOffer(sosAck)).toBe(false);
  });

  it('rejects a driver document verdict', () => {
    expect(isClaimableOffer({
      vertical: 'rideshare', urgency: 'actionable', type: 'driver_doc.status_changed',
      entity_type: 'driver_document', entity_id: 1,
    })).toBe(false);
  });

  it('rejects actionable notifications from verticals with no claim flow', () => {
    expect(isClaimableOffer({
      vertical: 'system', urgency: 'actionable', entity_type: 'bug_report', entity_id: 7,
    })).toBe(false);
    expect(isClaimableOffer({
      vertical: 'booking', urgency: 'actionable', entity_type: 'payment_intent', entity_id: null,
    })).toBe(false);
  });

  it('still accepts the other verticals that genuinely claim', () => {
    expect(isClaimableOffer({ vertical: 'work', urgency: 'actionable', entity_type: 'work_job', entity_id: 5 })).toBe(true);
    expect(isClaimableOffer({ vertical: 'work', urgency: 'actionable', entity_type: 'service_order', entity_id: 5 })).toBe(true);
    expect(isClaimableOffer({ vertical: 'ecommerce', urgency: 'actionable', entity_type: 'product_listing', entity_id: 5 })).toBe(true);
  });

  it('rejects ambient notifications outright', () => {
    expect(isClaimableOffer({ ...rideOffer, urgency: 'ambient' })).toBe(false);
  });

  it('rejects a notification with no entity_type rather than guessing', () => {
    expect(isClaimableOffer({ vertical: 'rideshare', urgency: 'actionable', entity_id: 3 })).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isClaimableOffer(null)).toBe(false);
    expect(isClaimableOffer(undefined)).toBe(false);
  });
});

describe('isInlineAcceptableRide', () => {
  it('is true only for a ride_request on the rideshare vertical', () => {
    expect(isInlineAcceptableRide(rideOffer)).toBe(true);
  });

  // This is the destructive case: entity_id 3 here is an SOS incident, and passing it to
  // acceptRide/declineRide hit PUT /ride-request/3/{accept,decline} on an unrelated ride.
  it('is false for an SOS incident that shares a ride id', () => {
    expect(isInlineAcceptableRide(sosAck)).toBe(false);
  });

  it('is false for claimable offers in other verticals', () => {
    expect(isInlineAcceptableRide({ vertical: 'work', urgency: 'actionable', entity_type: 'work_job', entity_id: 5 })).toBe(false);
  });
});
