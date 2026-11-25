import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// The gig form is gated behind an active service-provider account, so it can't
// be reached in the live staging session. This test mounts it directly (with the
// freelance API modules mocked so the on-mount fetches don't hit MSW) to prove
// every <label> resolves an accessible name for its control — the useId
// htmlFor/id wiring, and the Packages group heading. We deliberately do NOT mock
// the shared useViewport hook: it reads window.innerWidth (jsdom defaults to a
// desktop width), and a partial mock of a widely-used hook risks leaking into
// other test files under the runner's fork pool.
vi.mock('../../api/freelancer-categories.js', () => ({
  getFreelanceCategories: vi.fn(() => Promise.resolve([])),
  getFreelanceSubcategories: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../api/freelance-gig.js', () => ({
  createFreelanceGig: vi.fn(),
  updateFreelanceGig: vi.fn(),
  uploadFreelanceImages: vi.fn(),
}));

import { FreelanceGigForm } from './FreelanceGigForm.jsx';

describe('FreelanceGigForm form labels', () => {
  it('associates every field label with its control', async () => {
    render(<FreelanceGigForm onClose={() => {}} onSave={() => {}} />);

    // Native controls named via htmlFor/id.
    await waitFor(() => expect(screen.getByLabelText('Category *')).toHaveProperty('tagName', 'SELECT'));
    expect(screen.getByLabelText('Subcategory *')).toHaveProperty('tagName', 'SELECT');
    expect(screen.getByLabelText('Title *')).toHaveProperty('tagName', 'INPUT');
    expect(screen.getByLabelText('Description *')).toHaveProperty('tagName', 'TEXTAREA');
    // Hidden file input behind the upload dropzone.
    const images = screen.getByLabelText('Images');
    expect(images).toHaveAttribute('type', 'file');
    // The repeated package cards are grouped and named by their heading.
    expect(screen.getByRole('group', { name: 'Packages *' })).toBeInTheDocument();
  });
});
