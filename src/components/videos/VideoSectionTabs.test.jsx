import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k) => ({ 'nav.home': 'Home', 'videos.shorts': 'Clips', 'videos.landingTitle': 'Videos' })[k] ?? k,
  }),
}));

import VideoSectionTabs from './VideoSectionTabs.jsx';

const setup = (activeTab = 'browse') => {
  const onSelect = vi.fn();
  render(<VideoSectionTabs activeTab={activeTab} onSelect={onSelect} />);
  return { onSelect };
};

describe('VideoSectionTabs', () => {
  it('offers exactly the two content sections', () => {
    setup();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Home', 'Clips']);
  });

  it('marks Home selected on the browse tab', () => {
    setup('browse');
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Clips' })).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the short-form tab selected on the shorts tab', () => {
    setup('shorts');
    expect(screen.getByRole('tab', { name: 'Clips' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'false');
  });

  it('reports the page tab ids the Videos page switches on', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup('browse');
    await user.click(screen.getByRole('tab', { name: 'Clips' }));
    expect(onSelect).toHaveBeenCalledWith('shorts');
    await user.click(screen.getByRole('tab', { name: 'Home' }));
    expect(onSelect).toHaveBeenCalledWith('browse');
  });

  it('selects neither tab while a Library tab is open', () => {
    setup('history');
    screen.getAllByRole('tab').forEach((t) => {
      expect(t).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('exposes a labelled tablist', () => {
    setup();
    expect(screen.getByRole('tablist', { name: 'Videos' })).toBeInTheDocument();
  });
});
