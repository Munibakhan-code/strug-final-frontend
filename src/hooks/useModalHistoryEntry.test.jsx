import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalHistoryEntry } from './useModalHistoryEntry.js';

function Fixture({ canClose = true, onClose = () => {} }) {
  const [open, setOpen] = useState(true);
  const requestClose = useModalHistoryEntry(open, () => {
    if (onClose() === false) return false;
    setOpen(false);
  }, { key: 'fixture', canClose });
  return open ? <button type="button" onClick={requestClose}>Close modal</button> : <p>Closed</p>;
}

describe('useModalHistoryEntry', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds a same-page history entry and consumes it for an explicit close', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(<Fixture />);
    expect(window.history.state?.__strugModal).toMatch(/^fixture:/);
    await userEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('closes the modal when browser Back dispatches popstate', async () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText('Closed')).toBeInTheDocument());
  });

  it('keeps a blocked modal open and restores its history guard', () => {
    const push = vi.spyOn(window.history, 'pushState');
    render(<Fixture canClose={false} />);
    const pushesAfterOpen = push.mock.calls.length;
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
    expect(push.mock.calls.length).toBe(pushesAfterOpen + 1);
  });

  it('preserves Back protection when draft confirmation defers closing', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    const onClose = vi.fn().mockReturnValue(false);
    render(<Fixture onClose={onClose} />);
    const marker = window.history.state.__strugModal;
    const initialPushes = push.mock.calls.length;
    for (let index = 0; index < 2; index += 1) {
      act(() => window.dispatchEvent(new PopStateEvent('popstate')));
      expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
      expect(window.history.state.__strugModal).toBe(marker);
    }
    expect(push.mock.calls.length).toBe(initialPushes + 2);
    onClose.mockReturnValue(undefined);
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await waitFor(() => expect(screen.getByText('Closed')).toBeInTheDocument());
    expect(push.mock.calls.length).toBe(initialPushes + 2);
  });
});
