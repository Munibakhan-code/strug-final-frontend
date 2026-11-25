import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, useDialog } from './ConfirmDialog.jsx';
import { EXIT_MS } from './modalKit.jsx';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ConfirmDialog open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the title, message and both buttons when open', () => {
    render(<ConfirmDialog open title="Delete this?" message="No undo" confirmLabel="Delete" cancelLabel="Cancel" />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this?')).toBeInTheDocument();
    expect(screen.getByText('No undo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  // Each interaction is tested on its own render: the first action starts the
  // close transition, and the mid-exit guard intentionally swallows any second
  // trigger — so a real user only ever fires one of these per dialog.
  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} confirmLabel="Delete" cancelLabel="Cancel" />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // The glass close transition defers the callback by EXIT_MS before firing.
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1), { timeout: EXIT_MS + 200 });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} confirmLabel="Delete" cancelLabel="Cancel" />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1), { timeout: EXIT_MS + 200 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('hides the cancel button in alertOnly mode', () => {
    render(<ConfirmDialog open alertOnly confirmLabel="OK" cancelLabel="Cancel" />);
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('disables buttons and shows a working state when busy', () => {
    render(<ConfirmDialog open busy confirmLabel="Delete" />);
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });

  it('Esc cancels', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    // Callback fires after the EXIT_MS close transition, not synchronously.
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1), { timeout: EXIT_MS + 200 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Enter confirms', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1), { timeout: EXIT_MS + 200 });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('useDialog', () => {
  function Harness() {
    const [dialog, { confirm }] = useDialog();
    const [result, setResult] = useState('');
    return (
      <div>
        <button onClick={async () => setResult(String(await confirm({ title: 'Sure?' })))}>ask</button>
        <span data-testid="result">{result}</span>
        {dialog}
      </div>
    );
  }

  it('confirm() opens the dialog and resolves true when confirmed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'ask' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' })); // default confirmLabel
    // Promise resolves after the EXIT_MS close transition completes.
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('true'), { timeout: EXIT_MS + 200 });
  });

  it('confirm() resolves false when cancelled', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('false'), { timeout: EXIT_MS + 200 });
  });
});
