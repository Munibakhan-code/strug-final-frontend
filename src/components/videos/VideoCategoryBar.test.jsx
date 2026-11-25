import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// i18n: return the key's last segment so aria-labels are assertable without booting the real
// resource bundles (the component only translates chrome labels, never the category names —
// those arrive pre-translated via the `categories` prop, exactly as VideosPage supplies them).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => ({ 'videos.categoryFilter': 'Filter videos by category', 'common.previous': 'Previous', 'common.next': 'Next' })[k] ?? k }),
}));

const mockViewport = { isMobile: false };
vi.mock('../../hooks/useViewport.js', () => ({ useViewport: () => mockViewport }));

import VideoCategoryBar from './VideoCategoryBar.jsx';

// Mirrors VIDEO_CATEGORY_DEFS in pages/Videos.jsx after useI18nCategoryList() resolves labels.
// "Entertainment" is deliberately present: the old photo tiles truncated it to "Entertainme…".
const CATEGORIES = [
  { id: 'all', label: 'All', match: null },
  { id: 'music', label: 'Music', match: 'Music' },
  { id: 'gaming', label: 'Gaming', match: 'Gaming' },
  { id: 'sports', label: 'Sports', match: 'Sports' },
  { id: 'news', label: 'News', match: 'News' },
  { id: 'entertainment', label: 'Entertainment', match: 'Entertainment' },
  { id: 'education', label: 'Education', match: 'Education' },
  { id: 'tech', label: 'Tech', match: 'Tech' },
  { id: 'comedy', label: 'Comedy', match: 'Comedy' },
  { id: 'travel', label: 'Travel', match: 'Travel' },
];

const setup = (props = {}) => {
  const onSelect = vi.fn();
  const utils = render(
    <VideoCategoryBar categories={CATEGORIES} activeId="all" onSelect={onSelect} {...props} />,
  );
  return { onSelect, ...utils };
};

beforeEach(() => {
  mockViewport.isMobile = false;
});

// jsdom gives every box a size of 0, so the bar never sees an overflow and the arrows never
// render. Make the chips report a width larger than their container.
function stubOverflowingLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(120);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(10);
}
afterEach(() => { vi.restoreAllMocks(); });

describe('VideoCategoryBar', () => {
  it('renders every category with its full label', () => {
    setup();
    CATEGORIES.forEach((c) => {
      expect(screen.getByRole('radio', { name: c.label })).toBeInTheDocument();
    });
    // The label the old tile row truncated must render in full.
    expect(screen.getByRole('radio', { name: 'Entertainment' })).toHaveTextContent('Entertainment');
  });

  it('marks only the active category as selected', () => {
    setup({ activeId: 'gaming' });
    expect(screen.getByRole('radio', { name: 'Gaming' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('reports the stable category id — not the label — when a pill is clicked', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(screen.getByRole('radio', { name: 'Entertainment' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    // The id is what VideosPage maps back to `match` for the API `category` param.
    expect(onSelect).toHaveBeenCalledWith('entertainment');
  });

  it('keeps "All" selectable so the unfiltered feed can be restored', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup({ activeId: 'music' });
    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(onSelect).toHaveBeenCalledWith('all');
  });

  it('exposes a labelled radiogroup for assistive tech', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Filter videos by category' })).toBeInTheDocument();
  });

  it('uses a roving tabindex so the strip is a single tab stop', () => {
    setup({ activeId: 'news' });
    expect(screen.getByRole('radio', { name: 'News' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus with Left/Right arrows and selects with Enter', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    const all = screen.getByRole('radio', { name: 'All' });
    all.focus();
    expect(all).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Music' })).toHaveFocus();
    // Arrow keys move focus only — selection stays put until the user commits.
    expect(onSelect).not.toHaveBeenCalled();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Gaming' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('gaming');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Music' })).toHaveFocus();
  });

  it('selects the focused category with Space', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    screen.getByRole('radio', { name: 'All' }).focus();
    await user.keyboard('{ArrowRight}{ }');
    expect(onSelect).toHaveBeenCalledWith('music');
  });

  it('jumps to the first/last category with Home/End', async () => {
    const user = userEvent.setup();
    setup();
    screen.getByRole('radio', { name: 'All' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Travel' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
  });

  it('does not clamp focus past either end of the strip', async () => {
    const user = userEvent.setup();
    setup();
    const all = screen.getByRole('radio', { name: 'All' });
    all.focus();
    await user.keyboard('{ArrowLeft}');
    expect(all).toHaveFocus();
  });

  it('renders no arrow controls on touch layouts', () => {
    mockViewport.isMobile = true;
    setup();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('renders no arrow controls when the row fits (no overflow)', () => {
    // jsdom reports scrollWidth === clientWidth === 0, i.e. nothing overflows.
    setup();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('keeps the strip on one line so it cannot wrap into a second row', () => {
    setup();
    expect(screen.getByRole('radiogroup')).toHaveStyle({ flexWrap: 'nowrap' });
  });
});

// A phone gets no control beside the strip at all — swiping is the gesture, and anything parked
// next to the row eats width the chips need at 375px.
describe('touch layouts carry no controls', () => {
  it('shows nothing beside the strip even when the row overflows', () => {
    mockViewport.isMobile = true;
    stubOverflowingLayout();
    setup();
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    // Nothing else either: the chips expose role="radio", so a bar with no controls beside them
    // has no element with the button role at all.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('radio')).toHaveLength(CATEGORIES.length);
  });

  it('gives the whole bar width to the chips', () => {
    mockViewport.isMobile = true;
    stubOverflowingLayout();
    setup();
    const strip = screen.getByRole('radiogroup');
    expect(strip.parentElement.children).toHaveLength(1);
  });

  it('still gives a pointer device its arrows when the row overflows', () => {
    mockViewport.isMobile = false;
    stubOverflowingLayout();
    setup();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
