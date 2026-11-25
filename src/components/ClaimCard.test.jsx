import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClaimCard from './ClaimCard.jsx';

const rideOffer = {
  key: 'rideshare:42', vertical: 'rideshare', rideId: 42,
  title: 'Incoming ride request', from: 'King St W', to: 'Union',
  fare: 18.4, eta: '7 min', distance: '4.2 km', pickupEta: '3 min',
  expiresAt: new Date(Date.now() + 120000).toISOString(), offerTimeoutSec: 120,
  actionUrl: 'sd-drive',
};

describe('ClaimCard', () => {
  it('renders nothing when there is no offer', () => {
    const { container } = render(<ClaimCard offer={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a ride offer with fare, route and Accept/Decline', () => {
    render(<ClaimCard offer={rideOffer} />);
    expect(screen.getByRole('alertdialog', { name: 'Incoming ride' })).toBeInTheDocument();
    expect(screen.getByText('$18.40')).toBeInTheDocument();
    expect(screen.getByText(/King St W/)).toBeInTheDocument();
    expect(screen.getByText(/Union/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('Accept fires onAccept, Decline fires onDecline', async () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const user = userEvent.setup();
    render(<ClaimCard offer={rideOffer} onAccept={onAccept} onDecline={onDecline} />);
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onAccept).toHaveBeenCalledWith(rideOffer);
    expect(onDecline).toHaveBeenCalledWith(rideOffer);
  });

  it('non-rideshare offers show View/Dismiss and fire onView', async () => {
    const onView = vi.fn();
    const user = userEvent.setup();
    const workOffer = { ...rideOffer, key: 'work:9', vertical: 'work', rideId: null, actionUrl: 'sd-work' };
    render(<ClaimCard offer={workOffer} onView={onView} />);
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(onView).toHaveBeenCalledWith(workOffer);
  });

  it('shows the Accepting… state while busy', () => {
    render(<ClaimCard offer={rideOffer} busy="rideshare:42" />);
    expect(screen.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
  });

  it('surfaces an error message', () => {
    render(<ClaimCard offer={rideOffer} error="Could not accept — it may have expired." />);
    expect(screen.getByText(/Could not accept/)).toBeInTheDocument();
  });
});
