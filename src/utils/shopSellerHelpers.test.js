/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  filterListingsForShopSeller,
  isShopSellerListing,
  mapProductOrderStatusLabel,
  sellerNetFromOrderTotal,
  sellerPayoutBucket,
  sellerOrderGross,
  sellerOrderNet,
  sellerWalletTotalsFromOrders,
  foodOrderSellerGross,
  foodVendorNetOf,
  parseStorePrepTime,
  buildStorePrepTime,
  overviewStatsFromAnalytics,
  earningsPeriodBuckets,
  earningsExportWindow,
  filterOrdersInPeriod,
  buildEarningsDataPoints,
  earningsSummaryFromOrders,
} from './shopSellerHelpers.js';

describe('isShopSellerListing', () => {
  it('keeps Shop and custom categories', () => {
    expect(isShopSellerListing({ product_type: { product_type_name: 'Shop' } })).toBe(true);
    expect(isShopSellerListing({ product_type: { product_type_name: 'Clothing' } })).toBe(true);
  });

  it('excludes other verticals', () => {
    expect(isShopSellerListing({ product_type: { product_type_name: 'SecondHand' } })).toBe(false);
    expect(isShopSellerListing({ product_type: { product_type_name: 'Wedding' } })).toBe(false);
  });
});

describe('filterListingsForShopSeller', () => {
  it('filters mixed seller listings', () => {
    const list = [
      { listing_id: 1, product_type: { product_type_name: 'Clothing' } },
      { listing_id: 2, product_type: { product_type_name: 'Decor' } },
    ];
    expect(filterListingsForShopSeller(list).map((l) => l.listing_id)).toEqual([1]);
  });
});

describe('mapProductOrderStatusLabel', () => {
  it('capitalizes backend status and defaults paid/null to Pending', () => {
    expect(mapProductOrderStatusLabel({ status: 'confirmed' })).toBe('Confirmed');
    expect(mapProductOrderStatusLabel({ status: null, ispaid: true })).toBe('Pending');
    expect(mapProductOrderStatusLabel({})).toBe('Pending');
  });
});

describe('sellerNetFromOrderTotal', () => {
  it('applies seller net rate once', () => {
    expect(sellerNetFromOrderTotal(100)).toBeCloseTo(79);
  });
});

describe('sellerPayoutBucket', () => {
  it('treats picked up / delivered as available', () => {
    expect(sellerPayoutBucket('Picked Up')).toBe('available');
    expect(sellerPayoutBucket('delivered')).toBe('available');
    expect(sellerPayoutBucket('picked_up')).toBe('available');
  });

  it('treats in-progress as pending and rejected as none', () => {
    expect(sellerPayoutBucket('Preparing')).toBe('pending');
    expect(sellerPayoutBucket('Ready for Pickup')).toBe('pending');
    expect(sellerPayoutBucket('Rejected')).toBe('none');
    expect(sellerPayoutBucket('cancelled')).toBe('none');
  });
});

describe('sellerOrderGross / sellerOrderNet', () => {
  it('uses numeric total and never parses a formatted amount string', () => {
    expect(sellerOrderGross({ total: 100, amount: 'A$79.00' })).toBe(100);
    expect(sellerOrderGross({ amount: 'A$79.00' })).toBe(0);
    expect(sellerOrderNet({ total: 100 })).toBeCloseTo(79);
  });

  it('uses a numeric ledger amount as net', () => {
    expect(sellerOrderNet({ amount: 21.58 })).toBeCloseTo(21.58);
  });
});

describe('sellerWalletTotalsFromOrders', () => {
  it('splits available vs pending and excludes rejected from lifetime', () => {
    const totals = sellerWalletTotalsFromOrders([
      { total: 100, status: 'Picked Up' },
      { total: 50, status: 'Preparing' },
      { total: 80, status: 'Rejected' },
    ]);
    expect(totals.available).toBeCloseTo(79);
    expect(totals.pending).toBeCloseTo(39.5);
    expect(totals.lifetime).toBeCloseTo(79);
  });
});

describe('foodOrderSellerGross', () => {
  it('prefers line items over buyer grand total', () => {
    expect(foodOrderSellerGross({
      total_amount: 40,
      food_order_items: [{ price: 10, qty: 2 }],
    })).toBe(20);
  });
});

describe('foodVendorNetOf', () => {
  it('recovers item subtotal from platform_fee ÷ fee rate (matches ledger)', () => {
    expect(foodVendorNetOf({ platform_fee: 8 })).toBeCloseTo(100);
  });

  it('falls back to total minus delivery and tip when platform_fee is missing', () => {
    expect(foodVendorNetOf({
      total_amount: 120,
      delivery_fee: 10,
      tip_amount: 5,
    })).toBeCloseTo(105);
  });
});

describe('sellerOrderNet with food orders', () => {
  it('uses foodVendorNetOf for food orders instead of the 21% shop estimate', () => {
    expect(sellerOrderNet({ platform_fee: 8, food_order_id: 1 })).toBeCloseTo(100);
  });
});

describe('parseStorePrepTime / buildStorePrepTime', () => {
  it('round-trips policy fields without embedding bio', () => {
    const json = buildStorePrepTime({ returnPolicy: '30 days', shippingInfo: '2-4 days' });
    expect(parseStorePrepTime(json)).toEqual({
      returnPolicy: '30 days',
      shippingInfo: '2-4 days',
      description: '',
    });
    expect(json.length).toBeLessThanOrEqual(255);
  });

  it('truncates long policy JSON under 255 chars', () => {
    const json = buildStorePrepTime({
      returnPolicy: 'x'.repeat(200),
      shippingInfo: 'y'.repeat(200),
    });
    expect(json.length).toBeLessThanOrEqual(255);
  });
});

describe('overviewStatsFromAnalytics', () => {
  it('prefers analytics summary when present', () => {
    expect(overviewStatsFromAnalytics({ summary: { net: 120, count: 4 } }, [])).toEqual({
      revenue: 120,
      orderCount: 4,
    });
  });

  it('falls back to local order net totals', () => {
    const stats = overviewStatsFromAnalytics(null, [{ total: 100 }, { total: 50 }]);
    expect(stats.orderCount).toBe(2);
    expect(stats.revenue).toBeCloseTo(118.5);
  });
});

describe('earningsPeriodBuckets / filterOrdersInPeriod', () => {
  const now = new Date('2026-08-21T12:00:00');

  it('builds 7 daily buckets ending today', () => {
    const buckets = earningsPeriodBuckets('Daily', now, 'en');
    expect(buckets).toHaveLength(7);
    expect(buckets[6].start.toDateString()).toBe(new Date('2026-08-21').toDateString());
  });

  it('labels weekly buckets with date ranges', () => {
    const buckets = earningsPeriodBuckets('Weekly', now, 'en');
    expect(buckets).toHaveLength(4);
    expect(buckets[0].label).toMatch(/–/);
  });

  it('export window spans first bucket start to last bucket end', () => {
    const { start, end } = earningsExportWindow('Daily', now);
    const buckets = earningsPeriodBuckets('Daily', now);
    expect(start.getTime()).toBe(buckets[0].start.getTime());
    expect(end.getTime()).toBe(buckets[6].end.getTime());
  });

  it('filters earned orders inside the period only', () => {
    const orders = [
      { total: 100, status: 'Delivered', created_at: '2026-08-20T10:00:00' },
      { total: 50, status: 'Preparing', created_at: '2026-08-20T10:00:00' },
      { total: 80, status: 'Delivered', created_at: '2026-07-01T10:00:00' },
    ];
    const { start, end } = earningsExportWindow('Daily', now);
    const inPeriod = filterOrdersInPeriod(orders, start, end, { earnedOnly: true });
    expect(inPeriod).toHaveLength(1);
    expect(inPeriod[0].total).toBe(100);
  });
});

describe('buildEarningsDataPoints / earningsSummaryFromOrders', () => {
  it('sums period net from available orders and reports lifetime separately', () => {
    const now = new Date('2026-08-21T12:00:00');
    const orders = [
      { total: 100, status: 'Delivered', created_at: '2026-08-20T10:00:00', seller_net: 79 },
      { total: 200, status: 'Delivered', created_at: '2026-01-01T10:00:00', seller_net: 158 },
      { total: 50, status: 'Rejected', created_at: '2026-08-20T10:00:00', seller_net: 40 },
    ];
    const points = buildEarningsDataPoints(orders, 'Daily', now, 'en');
    const periodNet = points.reduce((s, d) => s + d.val, 0);
    expect(periodNet).toBeCloseTo(79);
    const summary = earningsSummaryFromOrders(orders, periodNet);
    expect(summary.completedCount).toBe(2);
    expect(summary.allOrdersCount).toBe(3);
    expect(summary.lifetimeNet).toBeCloseTo(237);
    expect(summary.periodNet).toBeCloseTo(79);
  });
});
