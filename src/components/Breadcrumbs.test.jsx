import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Breadcrumbs from './Breadcrumbs.jsx';

describe('Breadcrumbs', () => {
  it('renders an accessible icon-only parent crumb with a practical touch target', () => {
    const onHome = vi.fn();
    render(
      <Breadcrumbs trail={[
        {
          label: <svg data-testid="home-icon" />,
          onClick: onHome,
          iconOnly: true,
          ariaLabel: 'Go to Strug Home',
          title: 'Go to Strug Home',
        },
        { label: 'Videos' },
      ]} />,
    );

    const home = screen.getByRole('button', { name: 'Go to Strug Home' });
    expect(home).toHaveStyle({ width: '44px', height: '44px' });
    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
    fireEvent.click(home);
    expect(onHome).toHaveBeenCalledOnce();
    expect(screen.getByText('Videos')).toHaveAttribute('aria-current', 'page');
  });

  it('preserves the standard text breadcrumb', () => {
    render(<Breadcrumbs trail={[{ label: 'Home', onClick: () => {} }, { label: 'Videos' }]} />);
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });
});
