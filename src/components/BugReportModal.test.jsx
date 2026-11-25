import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Isolate the component from the HTTP layer — assert it calls the API correctly.
vi.mock('../api/bugs', () => ({ submitBugReport: vi.fn() }));
import { submitBugReport } from '../api/bugs';
import BugReportModal from './BugReportModal.jsx';
import { setUser } from '../store/auth.js';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('BugReportModal', () => {
  it('prompts the visitor to log in when no user is present', () => {
    render(<BugReportModal onClose={() => {}} />);
    expect(screen.getByText(/Please log in to submit/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Short summary/i)).toBeNull();
  });

  it('renders the form for a logged-in user', () => {
    setUser({ user_id: 1 });
    render(<BugReportModal onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/Short summary/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit report/i })).toBeInTheDocument();
  });

  it('associates each field with its visible label (accessible names)', () => {
    setUser({ user_id: 1 });
    render(<BugReportModal onClose={() => {}} />);
    // getByLabelText resolves via the htmlFor/id association — proves each field is labelled.
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toBeInTheDocument();
    expect(screen.getByLabelText(/Screenshots/)).toBeInTheDocument();
  });

  it('validates the title and does not submit when too short', async () => {
    setUser({ user_id: 1 });
    const user = userEvent.setup();
    render(<BugReportModal onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /Submit report/i }));
    expect(screen.getByText(/give the issue a short title/i)).toBeInTheDocument();
    expect(submitBugReport).not.toHaveBeenCalled();
  });

  it('submits a valid report and shows the success state', async () => {
    setUser({ user_id: 1 });
    submitBugReport.mockResolvedValueOnce({ successful: true });
    const user = userEvent.setup();
    render(<BugReportModal onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/Short summary/i), 'Login button broken');
    await user.type(screen.getByPlaceholderText(/Steps to reproduce/i), 'It does nothing when I click it at all');
    await user.click(screen.getByRole('button', { name: /Submit report/i }));

    expect(submitBugReport).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Login button broken',
      description: 'It does nothing when I click it at all',
      category: 'bug',
      severity: 'medium',
      screenshots: [],
    }));
    expect(await screen.findByText(/Thanks for the report/i)).toBeInTheDocument();
  });

  it('surfaces a server error message', async () => {
    setUser({ user_id: 1 });
    submitBugReport.mockRejectedValueOnce({ response: { data: { message: 'Rate limited' } } });
    const user = userEvent.setup();
    render(<BugReportModal onClose={() => {}} />);
    await user.type(screen.getByPlaceholderText(/Short summary/i), 'A valid title');
    await user.type(screen.getByPlaceholderText(/Steps to reproduce/i), 'A sufficiently long description');
    await user.click(screen.getByRole('button', { name: /Submit report/i }));
    expect(await screen.findByText('Rate limited')).toBeInTheDocument();
  });

  it('calls onClose from the close button (after the exit animation)', async () => {
    // onClose is deferred until the fade/pop-out finishes, so the modal can animate out before it
    // unmounts — assert it lands, not that it lands synchronously.
    setUser({ user_id: 1 });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BugReportModal onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
