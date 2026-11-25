import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The browse view used to reference an undefined `DIGPROD_CATS`, which threw
// `ReferenceError: DIGPROD_CATS is not defined` the moment a creator was opened — the whole
// page went blank. The category pills now come from `useI18nCategoryList(DIGPROD_CATEGORY_DEFS)`
// and filtering goes through `matchesCategory` on the STABLE id, so a non-English UI still
// matches the English `item.category` values the API returns.

const clientMock = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../api/client', () => ({ default: clientMock }));
vi.mock('../hooks/usePageLoad.js', () => ({ usePageLoad: () => false }));
vi.mock('../hooks/useViewport.js', () => ({ useViewport: () => ({ isMobile: false }) }));
vi.mock('../hooks/usePageI18n.js', () => ({
  usePageI18n: () => ({
    t: (key) => key.split('.').at(-1),
    title: 'Digital Products',
    landingTitle: 'Digital Products',
    searchPlaceholder: 'Search',
  }),
}));
vi.mock('../i18n/index.js', () => ({ default: { t: (key) => key.split('.').at(-1) } }));

// Translate the category labels to something clearly NOT the English API value, so a test that
// passes can only be filtering on the stable id — never on the rendered label.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => `xx-${key.split('.').at(-1)}`,
  }),
}));

vi.mock('../components/shared-shopping/SharedShopping.jsx', () => ({
  CheckoutPage: () => null,
  createVerticalPlaceOrderHandler: () => () => Promise.resolve(),
}));

const CONTENT = [
  { content_id: 1, content_title: 'Notion Dashboard Template', content_description: '', author: 'Productivity Labs', price: 19 },
  { content_id: 2, content_title: 'Lightroom Presets Pack', content_description: '', author: 'Productivity Labs', price: 12 },
];

async function openBrowseView() {
  const { DigitalProductsPage } = await import('./DigitalProducts.jsx');
  render(<DigitalProductsPage onNavigate={() => {}} />);
  const creator = await screen.findByText('Productivity Labs');
  await userEvent.click(creator);
}

describe('DigitalProducts browse view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.get.mockResolvedValue({ data: CONTENT });
  });

  it('renders the browse view without throwing (regression: undefined DIGPROD_CATS)', async () => {
    await openBrowseView();
    // Reaching the product list at all proves the category map no longer references
    // an undefined binding.
    await waitFor(() => {
      expect(screen.getByText('Notion Dashboard Template')).toBeInTheDocument();
    });
  });

  it('renders one pill per category definition, using translated labels', async () => {
    await openBrowseView();
    // 7 defs: all, templates, courses, presets, assets, ebooks, audio.
    await waitFor(() => expect(screen.getByText('xx-all')).toBeInTheDocument());
    for (const label of ['xx-templates', 'xx-courses', 'xx-presets', 'xx-assets', 'xx-ebooks', 'xx-audio']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('filters by stable category id, not by the translated label', async () => {
    await openBrowseView();
    await waitFor(() => expect(screen.getByText('Notion Dashboard Template')).toBeInTheDocument());
    expect(screen.getByText('Lightroom Presets Pack')).toBeInTheDocument();

    // Pick "Templates". Its visible label is `xx-templates`, but the products carry the English
    // category "Templates" — so this only narrows correctly if matching runs on the id.
    await userEvent.click(screen.getByText('xx-templates'));

    await waitFor(() => {
      expect(screen.queryByText('Lightroom Presets Pack')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Notion Dashboard Template')).toBeInTheDocument();

    // Back to "all" restores both.
    await userEvent.click(screen.getByText('xx-all'));
    await waitFor(() => {
      expect(screen.getByText('Lightroom Presets Pack')).toBeInTheDocument();
    });
  });
});
