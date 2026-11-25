import { describe, expect, it, vi } from 'vitest';
import { buildOfferToast } from './offerToast.js';

const ride = {
  key: 'rideshare:42',
  vertical: 'rideshare',
  rideId: 42,
  title: 'Incoming ride request',
  from: 'King St W',
  to: 'Union Station',
  fare: 18.4,
};

describe('buildOfferToast', () => {
  it('creates a persistent rideshare toast with accept and decline actions', async () => {
    const accept = vi.fn();
    const decline = vi.fn();
    const toast = buildOfferToast(ride, { accept, decline });

    expect(toast).toMatchObject({
      key: 'offer:rideshare:42',
      vertical: 'rideshare',
      persistent: true,
    });
    expect(toast.body).toContain('King St W → Union Station');
    expect(toast.body).toContain('$18.40');
    expect(toast.actions.map((action) => action.label)).toEqual(['Accept', 'Decline']);

    await toast.actions[0].run();
    expect(accept).toHaveBeenCalledWith(ride);
  });

  it('uses a safe dashboard action for non-rideshare offers', async () => {
    const view = vi.fn();
    const offer = { key: 'courier:7', vertical: 'courier', title: 'Delivery available' };
    const toast = buildOfferToast(offer, { view });

    expect(toast.actions.map((action) => action.label)).toEqual(['View', 'Dismiss']);
    await toast.actions[0].run();
    expect(view).toHaveBeenCalledWith(offer);
  });
});
