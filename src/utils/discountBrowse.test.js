/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  calcDiscountPct,
  computePromoDiscountAmount,
  filterDiscountDeals,
  mapApiDeal,
  parseDiscountsPath,
} from './discountBrowse.js';

describe('discountBrowse', () => {
  it('maps API sale deals with real category (not hardcoded Shopping)', () => {
    const out = mapApiDeal({
      listing_id: 9,
      name: 'Sofa Sale',
      category: 'Shopping',
      product_type_name: 'Decor',
      source_vertical: 'decor',
      deep_link: '/listing/decor/9',
      orig_price: 200,
      sale_price: 150,
      discount_pct: 25,
      type: 'product',
      deal_kind: 'sale',
    });
    expect(out.category).toBe('Shopping');
    expect(out.sourceVertical).toBe('decor');
    expect(out.deepLink).toBe('/listing/decor/9');
    expect(out.discountPct).toBe(25);
  });

  it('maps coupon promotions', () => {
    const out = mapApiDeal({
      promotion_id: 3,
      name: 'STRUG10',
      code: 'STRUG10',
      category: 'Shopping',
      deal_kind: 'coupon',
      type: 'promotion',
      discount_type: 'percent',
      discount_value: 10,
      discount_pct: 10,
    });
    expect(out.dealKind).toBe('coupon');
    expect(out.code).toBe('STRUG10');
  });

  it('filters by category id and tab', () => {
    const rows = [
      { id: 1, name: 'Burger', category: 'Food', dealKind: 'sale' },
      { id: 2, name: 'STRUG10', category: 'Shopping', dealKind: 'coupon', code: 'STRUG10' },
    ];
    const categories = [{ id: 'food', match: 'Food' }];
    const out = filterDiscountDeals(rows, { activeCategory: 'food', categories, tab: 'sales' }, (activeId, itemValue, cats) => {
      const cat = cats.find((c) => c.id === activeId);
      return !cat || itemValue === cat.match;
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(1);
    expect(filterDiscountDeals(rows, { tab: 'coupons' }, () => true)).toHaveLength(1);
  });

  it('computes promo amounts and parses paths', () => {
    expect(computePromoDiscountAmount({ type: 'percent', value: 10 }, 100)).toBe(10);
    expect(computePromoDiscountAmount({ type: 'fixed', value: 5 }, 3)).toBe(3);
    expect(calcDiscountPct(100, 80)).toBe(20);
    expect(parseDiscountsPath('/discounts/promo/12')).toEqual({ view: 'promo', id: '12' });
  });
});
