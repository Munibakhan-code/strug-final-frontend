import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreatorModalViewport from './CreatorModalViewport.jsx';
import { creatorModalScrollStyle } from './creatorModalStyles.js';

afterEach(() => vi.unstubAllGlobals());

describe('Creator modal viewport', () => {
  it('places content outside the dashboard scroll container', () => {
    const { container } = render(<CreatorModalViewport><div style={creatorModalScrollStyle}><button>Last action</button></div></CreatorModalViewport>);
    expect(container).not.toContainElement(screen.getByRole('button', { name: 'Last action' }));
    expect(document.body).toContainElement(screen.getByRole('button', { name: 'Last action' }));
  });

  it('tracks keyboard/browser viewport changes and removes listeners on close', () => {
    const viewport = new EventTarget();
    viewport.height = 700;
    viewport.offsetTop = 0;
    const remove = vi.spyOn(viewport, 'removeEventListener');
    vi.stubGlobal('visualViewport', viewport);
    const { unmount } = render(<CreatorModalViewport><span>Content</span></CreatorModalViewport>);
    const overlay = screen.getByText('Content').parentElement;
    expect(overlay.style.height).toBe('700px');
    viewport.height = 310;
    viewport.offsetTop = 48;
    viewport.dispatchEvent(new Event('resize'));
    expect(overlay.style.height).toBe('310px');
    expect(overlay.style.top).toBe('48px');
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
