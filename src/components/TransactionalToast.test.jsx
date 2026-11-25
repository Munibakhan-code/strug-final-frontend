import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionalToast } from './TransactionalToast.jsx';

const toast = {
  key: 'ride:1', title: 'Incoming ride', body: 'Pickup nearby', nav: 'sd-drive',
  theme: { accent: '#3b82f6' },
  actions: [{ id: 'accept', label: 'Accept' }, { id: 'decline', label: 'Decline', intent: 'secondary' }],
};

describe('TransactionalToast', () => {
  it('renders a themed stack with actions', () => {
    const onAction = vi.fn();
    render(<TransactionalToast toasts={[toast]} onAction={onAction} onDismiss={() => {}} onOpen={() => {}} />);
    expect(screen.getByTestId('toast-ride:1')).toHaveStyle({ borderColor: '#3b82f6' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAction).toHaveBeenCalledWith(toast, toast.actions[0]);
  });

  it('disables actions while working and displays an error', () => {
    render(<TransactionalToast toasts={[{ ...toast, state: 'working', error: 'Could not accept' }]} onAction={() => {}} onDismiss={() => {}} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'Accepting…' })).toBeDisabled();
    expect(screen.getByText('Could not accept')).toBeInTheDocument();
  });

  it('supports legacy single-toast navigation and keyboard operation', () => {
    const onOpen = vi.fn();
    render(<TransactionalToast toast={{ title: 'Order', body: 'Ready', nav: 'orders' }} onDismiss={() => {}} onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Order/ }), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('orders', expect.objectContaining({ title: 'Order' }));
  });
});
