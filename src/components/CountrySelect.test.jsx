import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CountrySelect from './CountrySelect.jsx';

describe('CountrySelect accessible name', () => {
  it('takes its name from a visible label via ariaLabelledBy', () => {
    render(
      <>
        <label id="country-lbl">Country</label>
        <CountrySelect value="" onChange={() => {}} ariaLabelledBy="country-lbl" />
      </>
    );
    // The disclosure trigger is a combobox-like button; its name resolves from the label.
    expect(screen.getByRole('button', { name: 'Country' })).toBeInTheDocument();
  });

  it('falls back to an explicit ariaLabel', () => {
    render(<CountrySelect value="" onChange={() => {}} ariaLabel="Billing country" />);
    expect(screen.getByRole('button', { name: 'Billing country' })).toBeInTheDocument();
  });

  it('exposes aria-haspopup and reflects open state via aria-expanded', async () => {
    const user = userEvent.setup();
    render(<CountrySelect value="" onChange={() => {}} ariaLabel="Country" />);
    const trigger = screen.getByRole('button', { name: 'Country' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The in-panel search box is named for screen readers.
    expect(screen.getByRole('textbox', { name: 'Search country' })).toBeInTheDocument();
  });
});
