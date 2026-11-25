import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The wallet panel lives in the freelancer seller dashboard (Wallet tab), gated
// behind an active service-provider account, and its withdrawal form is a modal
// behind a "Withdraw Funds" button — so it can't be reached in the live staging
// session. We mount it here with only the leaf wallet API module mocked (a
// positive balance so the button is enabled) and assert every withdrawal-form
// <label> resolves an accessible name for its control. We do NOT mock any shared
// hook — a partial mock of a widely-used hook can leak across test files.
vi.mock('../../api/freelance-wallet.js', () => ({
  getFreelanceWallet: vi.fn(() => Promise.resolve({ successful: true, data: { available_balance: 500 } })),
  getFreelanceWalletTransactions: vi.fn(() => Promise.resolve({ successful: true, data: [] })),
  getWithdrawalRequests: vi.fn(() => Promise.resolve({ successful: true, data: [] })),
  createWithdrawalRequest: vi.fn(),
}));

import { FreelanceWalletPanel } from './FreelanceWalletPanel.jsx';

describe('FreelanceWalletPanel withdrawal-form labels', () => {
  it('associates every withdrawal field label with its control', async () => {
    const user = userEvent.setup();
    render(<FreelanceWalletPanel />);

    const withdrawBtn = await screen.findByRole('button', { name: /withdraw funds/i });
    await user.click(withdrawBtn);

    await waitFor(() => expect(screen.getByLabelText('Amount (USD)')).toHaveProperty('tagName', 'INPUT'));
    expect(screen.getByLabelText('Withdrawal Method')).toHaveProperty('tagName', 'SELECT');
    expect(screen.getByLabelText('Account Title')).toHaveProperty('tagName', 'INPUT');
    expect(screen.getByLabelText('Account Number')).toHaveProperty('tagName', 'INPUT');
  });
});
