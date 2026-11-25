import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clickableProps } from './shared.jsx';

describe('clickableProps', () => {
  it('gives a div button semantics and a tab stop', () => {
    render(<div {...clickableProps(() => {})}>go</div>);
    const el = screen.getByRole('button', { name: 'go' });
    expect(el).toHaveAttribute('tabindex', '0');
  });

  it('activates on Enter and Space', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<div {...clickableProps(onActivate)}>go</div>);
    const el = screen.getByRole('button', { name: 'go' });
    el.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('does not activate on other keys', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<div {...clickableProps(onActivate)}>go</div>);
    screen.getByRole('button', { name: 'go' }).focus();
    await user.keyboard('a{ArrowDown}{Tab}');
    expect(onActivate).not.toHaveBeenCalled();
  });
});
