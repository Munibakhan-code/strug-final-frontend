import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './shared.jsx';

describe('Tooltip', () => {
  it('is hidden by default and leaves the trigger undescribed', () => {
    render(<Tooltip text="Mute"><button>mute</button></Tooltip>);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('button', { name: 'mute' })).not.toHaveAttribute('aria-describedby');
  });

  it('shows on keyboard focus and associates the hint via aria-describedby', async () => {
    const user = userEvent.setup();
    render(<Tooltip text="Mute" shortcut="m"><button>mute</button></Tooltip>);
    const btn = screen.getByRole('button', { name: 'mute' });

    await user.tab();
    expect(btn).toHaveFocus();

    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Mute');
    expect(tip).toHaveTextContent('m'); // shortcut chip rendered
    // the trigger points at exactly the visible tooltip node
    expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.id).toBeTruthy();
  });

  it('removes the association again on blur', async () => {
    const user = userEvent.setup();
    render(<Tooltip text="Mute"><button>mute</button></Tooltip>);
    const btn = screen.getByRole('button', { name: 'mute' });

    await user.tab();
    await screen.findByRole('tooltip');
    await user.tab(); // move focus away

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(btn).not.toHaveAttribute('aria-describedby');
  });

  it('preserves a pre-existing aria-describedby when idle', () => {
    render(<Tooltip text="Mute"><button aria-describedby="external-hint">mute</button></Tooltip>);
    expect(screen.getByRole('button', { name: 'mute' })).toHaveAttribute('aria-describedby', 'external-hint');
  });
});
