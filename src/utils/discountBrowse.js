export const DISCOUNT_CATEGORY_DEFS = [
  { id: 'all', labelKey: 'events.categories.all', color: '#2563eb', match: null },
  { id: 'food', labelKey: 'discounts.categories.food', color: '#d97706', match: 'Food' },
  { id: 'shopping', labelKey: 'discounts.categories.shopping', color: '#db2777', match: 'Shopping' },
  { id: 'travel', labelKey: 'discounts.categories.travel', color: '#059669', match: 'Travel' },
  { id: 'services', labelKey: 'discounts.categories.services', color: '#7c3aed', match: 'Services' },
  { id: 'entertainment', labelKey: 'discounts.categories.entertainment', color: '#0891b2', match: 'Entertainment' },
  { id: 'health', labelKey: 'discounts.categories.health', color: '#dc2626', match: 'Health' },
];

const TYPE_THUMBS = {
  Food: 'linear-gradient(135deg, #451a03, #d97706)',
  Shopping: 'linear-gradient(135deg, #1e3a5f, #0f2744)',
  Travel: 'linear-gradient(135deg, #052e16, #059669)',
  Services: 'linear-gradient(135deg, #2e1065, #7c3aed)',
  Entertainment: 'linear-gradient(135deg, #083344, #0891b2)',
  Health: 'linear-gradient(135deg, #450a0a, #dc2626)',
};

export function calcDiscountPct(origPrice, salePrice) {
  const orig = Number(origPrice);
  const sale = Number(salePrice);
  if (!Number.isFinite(orig) || !Number.isFinite(sale) || orig <= 0 || sale >= orig) return 0;
  return Math.round((1 - sale / orig) * 100);
}

export function mapApiDeal(d, i = 0) {
  const category = d?.category || 'Shopping';
  const orig = Number(d?.orig_price ?? 0);
  const sale = Number(d?.sale_price ?? orig);
  const expires = d?.expires_at
    ? new Date(d.expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';
  return {
    thumb: TYPE_THUMBS[category] || TYPE_THUMBS.Shopping,
    accent: '#2563eb',
    expires,
    expiresAt: d?.expires_at || null,
    id: d?.listing_id ?? d?.promotion_id ?? i + 1,
    listing_id: d?.listing_id ?? null,
    promotion_id: d?.promotion_id ?? null,
    variation_id: d?.variation_id ?? null,
    seller_id: d?.seller_id ?? null,
    product_type_id: d?.product_type_id ?? d?.product_type?.product_type_id ?? null,
    dealType: d?.type || 'product',
    dealKind: d?.deal_kind || (d?.type === 'promotion' ? 'coupon' : 'sale'),
    name: d?.name || 'Deal',
    brand: d?.product_type_name || d?.category || '',
    category,
    sourceVertical: d?.source_vertical || 'shop',
    deepLink: d?.deep_link || (d?.listing_id ? `/listing/shop/${d.listing_id}` : null),
    code: d?.code || null,
    description: d?.description || null,
    image_url: d?.image_url || null,
    origPrice: orig,
    salePrice: sale,
    discountPct: Number(d?.discount_pct) || calcDiscountPct(orig, sale) || 0,
    discountType: d?.discount_type || null,
    discountValue: d?.discount_value != null ? Number(d.discount_value) : null,
    stock: Number(d?.stock ?? 0),
  };
}

export function filterDiscountDeals(deals, { activeCategory = 'all', categories = [], query = '', tab = 'all' } = {}, matchesCategoryFn) {
  const q = String(query || '').trim().toLowerCase();
  return (Array.isArray(deals) ? deals : []).filter((item) => {
    const categoryOk = typeof matchesCategoryFn === 'function'
      ? matchesCategoryFn(activeCategory, item.category, categories)
      : !activeCategory || activeCategory === 'all' || item.category === activeCategory;
    const tabOk = tab === 'all'
      || (tab === 'sales' && item.dealKind === 'sale')
      || (tab === 'coupons' && item.dealKind === 'coupon')
      || (tab === 'deals' && item.dealKind === 'deal');
    const queryOk = !q
      || String(item.name || '').toLowerCase().includes(q)
      || String(item.brand || '').toLowerCase().includes(q)
      || String(item.category || '').toLowerCase().includes(q)
      || String(item.code || '').toLowerCase().includes(q);
    return categoryOk && tabOk && queryOk;
  });
}

export function parseDiscountsPath(pathname) {
  const p = String(pathname || '');
  const promo = p.match(/^\/discounts\/promo\/([^/]+)\/?$/);
  if (promo) return { view: 'promo', id: promo[1] };
  const deal = p.match(/^\/discounts\/([^/]+)\/?$/);
  if (deal && deal[1] !== 'promo') return { view: 'deal', id: deal[1] };
  return { view: 'landing' };
}

export function discountsPathForDeal(deal) {
  if (deal?.deepLink) return deal.deepLink;
  if (deal?.promotion_id) return `/discounts/promo/${deal.promotion_id}`;
  if (deal?.listing_id) return `/discounts/${deal.listing_id}`;
  return '/discounts';
}

export function computePromoDiscountAmount(promo, subtotal) {
  const base = Math.max(0, Number(subtotal) || 0);
  if (!promo) return 0;
  if (promo.type === 'percent') return Math.min(base, base * (Number(promo.value) / 100));
  return Math.min(base, Number(promo.value) || 0);
}
