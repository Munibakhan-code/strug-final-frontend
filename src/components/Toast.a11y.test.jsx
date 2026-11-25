import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TransactionalToast } from './TransactionalToast.jsx';
import { ChatToast } from './ChatToast.jsx';

describe('toast a11y (live region)', () => {
  it('TransactionalToast announces politely and stays operable', () => {
    const { container } = render(<TransactionalToast toast={{ title: 'New order', body: 'Tap to view', nav: 'orders' }} onOpen={() => {}} onDismiss={() => {}} />);
    const el = container.querySelector('[aria-live="polite"]');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-atomic', 'true');
    expect(el).toHaveAttribute('role', 'button'); // still operable (tap to open)
    expect(el).toHaveTextContent('New order');
  });

  it('ChatToast announces politely and stays operable', () => {
    const { container } = render(<ChatToast toast={{ title: 'Ada', body: 'Hi there', channelId: 'c1', name: 'Ada' }} onOpen={() => {}} onDismiss={() => {}} />);
    const el = container.querySelector('[aria-live="polite"]');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-atomic', 'true');
    expect(el).toHaveAttribute('role', 'button');
  });

  it('renders nothing without a toast', () => {
    const { container } = render(<TransactionalToast toast={null} onOpen={() => {}} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
