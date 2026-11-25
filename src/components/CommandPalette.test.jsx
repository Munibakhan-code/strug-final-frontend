import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette, ShortcutsHelp } from './CommandPalette.jsx';

const ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'videos', label: 'Videos' },
  { id: 'food', label: 'Food', keywords: ['restaurant'] },
];

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CommandPalette open={false} items={ITEMS} onNavigate={() => {}} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('filters by label and keyword and navigates the highlighted result on Enter', async () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open items={ITEMS} onNavigate={onNavigate} onClose={onClose} />);

    // input auto-focuses; keyword match ("restaurant" -> Food)
    await user.keyboard('restaurant');
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();

    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('food');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CommandPalette open items={ITEMS} onNavigate={() => {}} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('respects a labelFor override for i18n', async () => {
    render(<CommandPalette open items={ITEMS} onNavigate={() => {}} onClose={() => {}} labelFor={(it) => `X-${it.label}`} />);
    expect(screen.getByRole('button', { name: 'X-Home' })).toBeInTheDocument();
  });
});

describe('ShortcutsHelp', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutsHelp open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists shortcut groups when open and closes on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShortcutsHelp open onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('Video player')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
