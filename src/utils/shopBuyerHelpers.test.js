/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  shopMatchesBuyerQuery,
  mapProductCartToLine,
  buildAddToCartPayload,
  mergeCartLine,
  mapProductRatingToReview,
  averageSellerRating,
  normalizeBuyerProductOrder,
  buildProductRatingPayload,
} from './shopBuyerHelpers.js';

describe('shopMatchesBuyerQuery', () => {
  const shop = {
    name: 'StyleHaus',
    products: [
      { name: 'Blue Hoodie', description: 'cotton', category: 'Clothing' },
    ],
  };

  it('matches shop name', () => {
    expect(shopMatchesBuyerQuery(shop, 'style')).toBe(true);
  });

  it('matches product fields', () => {
    expect(shopMatchesBuyerQuery(shop, 'hoodie')).toBe(true);
    expect(shopMatchesBuyerQuery(shop, 'clothing')).toBe(true);
    expect(shopMatchesBuyerQuery(shop, 'nomatch')).toBe(false);
  });
});

describe('mapProductCartToLine / buildAddToCartPayload', () => {
  it('maps cart API row to UI line', () => {
    const line = mapProductCartToLine({
      cart_id: 9,
      seller_id: 42,
      variation_id: 501,
      qty: 2,
      total: 180,
      product_type_id: 1,
      product_variation: {
        variation_id: 501,
        price: 90,
        product_listing: { listing_id: 101, name: 'Blue Hoodie', image_url: '/h.jpg' },
      },
    });
    expect(line).toMatchObject({
      cart_id: 9,
      variation_id: 501,
      seller_id: 42,
      name: 'Blue Hoodie',
      qty: 2,
      price: 90,
    });
  });

  it('builds add-to-cart payload with variation_id', () => {
    expect(buildAddToCartPayload({
      item: { variation_id: 501, price: 40, seller_id: 7 },
      buyerId: 3,
      sellerId: 7,
      qty: 2,
    })).toEqual({
      seller_id: 7,
      buyer_id: 3,
      variation_id: 501,
      qty: 2,
      total: 80,
    });
  });
});

describe('mergeCartLine', () => {
  it('increments qty for same variation', () => {
    const cart = [{ variation_id: 1, lineId: 10, qty: 1, price: 5 }];
    const next = mergeCartLine(cart, { variation_id: 1, lineId: 10, price: 5 }, 2);
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe(3);
  });
});

describe('ratings helpers', () => {
  it('maps rating rows and averages', () => {
    const review = mapProductRatingToReview({
      rating_id: 1,
      rating: 4,
      feedback: 'Great',
      user_product_ratings_buyer_idTouser: { name: 'Ada' },
    });
    expect(review.name).toBe('Ada');
    expect(review.stars).toBe(4);
    expect(review.date).toBe('');
    expect(averageSellerRating([{ rating: 5 }, { rating: 3 }])).toBe(4);
  });

  it('builds rating payload', () => {
    expect(buildProductRatingPayload({
      sellerId: 42,
      orderId: 99,
      buyerId: 7,
      rating: 5,
      feedback: 'Nice',
    })).toMatchObject({
      seller_id: 42,
      order_id: 99,
      buyer_id: 7,
      rating: 5,
      feedback: 'Nice',
    });
  });
});

describe('normalizeBuyerProductOrder', () => {
  it('reads nested listing and seller fields', () => {
    const order = normalizeBuyerProductOrder({
      order_id: 55,
      total: 42.5,
      status: 'confirmed',
      date: '2026-07-10T10:00:00Z',
      product_variation: { product_listing: { name: 'Blue Hoodie' } },
      user_product_order_seller_idTouser: { name: 'StyleHaus' },
    });
    expect(order).toMatchObject({
      id: '#PO-55',
      _rawId: 55,
      title: 'Blue Hoodie',
      seller: 'StyleHaus',
      amount: '$42.50',
      status: 'confirmed',
      date: '2026-07-10',
      trackable: true,
    });
  });
});
