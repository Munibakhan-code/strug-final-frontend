import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useFocusTrap } from './useFocusTrap.js';

// Minimal harness: an outside trigger opens a dialog that uses the trap.
function Harness() {
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap(open);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <div ref={trapRef} role="dialog" aria-modal="true">
          <button>first</button>
          <button>middle</button>
          <button onClick={() => setOpen(false)}>close</button>
        </div>
      )}
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('wraps Tab from the last focusable back to the first', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    // focus starts on "first"; tab to middle, close, then wrap back to first
    await user.tab(); // -> middle
    expect(screen.getByRole('button', { name: 'middle' })).toHaveFocus();
    await user.tab(); // -> close (last)
    expect(screen.getByRole('button', { name: 'close' })).toHaveFocus();
    await user.tab(); // wraps -> first
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
  });

  it('wraps Shift+Tab from the first focusable to the last', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus();
    await user.tab({ shift: true }); // wraps -> close (last)
    expect(screen.getByRole('button', { name: 'close' })).toHaveFocus();
  });

  it('restores focus to the trigger when the dialog closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'open' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(opener).toHaveFocus();
  });
});
