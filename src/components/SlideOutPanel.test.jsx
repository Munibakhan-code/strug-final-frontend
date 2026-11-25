import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlideOutEdgeTab } from './SlideOutPanel.jsx';

describe('SlideOutEdgeTab', () => {
  it('places the tab at the given top so it can sit clear of the Strug AI fab', () => {
    render(
      <SlideOutEdgeTab
        label="Watch History"
        top="calc(50% + 52px)"
        onClick={() => {}}
      />,
    );
    const tab = screen.getByTestId('slide-out-edge-tab');
    expect(tab).toHaveStyle({ top: 'calc(50% + 52px)', right: '0px', zIndex: '300' });
  });

  it('accepts a right offset for the page scrollbar gutter', () => {
    render(
      <SlideOutEdgeTab
        label="Watch History"
        top="42%"
        right={8}
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('slide-out-edge-tab')).toHaveStyle({ right: '8px' });
  });

  it('hides while the panel is open', () => {
    render(<SlideOutEdgeTab open label="Watch History" onClick={() => {}} />);
    expect(screen.queryByTestId('slide-out-edge-tab')).not.toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SlideOutEdgeTab label="Watch History" onClick={onClick} />);
    await user.click(screen.getByTestId('slide-out-edge-tab'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows activity glow and dot without using the notification system', () => {
    render(<SlideOutEdgeTab label="Saved" hasActivity onClick={() => {}} />);
    const tab = screen.getByTestId('slide-out-edge-tab');
    expect(tab).toHaveAttribute('data-has-activity', 'true');
    expect(screen.getByTestId('slide-out-edge-tab-activity-dot')).toBeInTheDocument();
    expect(screen.getByLabelText('Saved, has updates')).toBeInTheDocument();
    expect(tab.style.animation).toContain('slideOutTabGlow');
  });

  // A closed tab used to give nothing away, so a new pick / upload / friend watch went unnoticed.
  describe('unseen badge', () => {
    it('shows the count and glows when something is waiting', () => {
      render(<SlideOutEdgeTab label="Subs" badge="3" onClick={() => {}} />);
      const tab = screen.getByTestId('slide-out-edge-tab');
      expect(screen.getByTestId('slide-out-edge-tab-badge')).toHaveTextContent('3');
      expect(tab).toHaveAttribute('data-edge-tab-unseen', '3');
      expect(tab.style.animation).toContain('slideOutTabGlow');
    });

    it('stays quiet with nothing unseen', () => {
      render(<SlideOutEdgeTab label="Subs" onClick={() => {}} />);
      const tab = screen.getByTestId('slide-out-edge-tab');
      expect(screen.queryByTestId('slide-out-edge-tab-badge')).not.toBeInTheDocument();
      expect(tab).not.toHaveAttribute('data-edge-tab-unseen');
      expect(tab.style.animation).toBe('');
    });

    // The glow is decoration; the count has to reach a screen reader through the label.
    it('leaves the accessible name to the caller', () => {
      render(<SlideOutEdgeTab label="Subs" ariaLabel="Subs, 3 new" badge="3" onClick={() => {}} />);
      expect(screen.getByRole('button', { name: 'Subs, 3 new' })).toBeInTheDocument();
    });

    it('appends has updates when ariaLabel and hasActivity are both set', () => {
      render(
        <SlideOutEdgeTab
          label="Saved"
          ariaLabel="Saved"
          hasActivity
          onClick={() => {}}
        />,
      );
      expect(screen.getByRole('button', { name: 'Saved, has updates' })).toBeInTheDocument();
    });
  });

  it('supports compact mobile tabs', () => {
    render(<SlideOutEdgeTab label="Saved" compact onClick={() => {}} />);
    const tab = screen.getByTestId('slide-out-edge-tab');
    expect(tab).toHaveAttribute('data-compact', 'true');
    expect(tab).toHaveStyle({ width: '40px' });
  });
});
