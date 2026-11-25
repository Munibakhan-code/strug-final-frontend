/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as shopApi from './shop.js';

describe('shop API surface', () => {
  it('exports catalog CRUD helpers', () => {
    expect(typeof shopApi.getProducts).toBe('function');
    expect(typeof shopApi.getProduct).toBe('function');
    expect(typeof shopApi.createProduct).toBe('function');
  });

  it('exports store profile helpers (re-exported from user)', () => {
    expect(typeof shopApi.getStoreProfile).toBe('function');
    expect(typeof shopApi.updateStoreProfile).toBe('function');
    expect(typeof shopApi.uploadStoreBranding).toBe('function');
    expect(typeof shopApi.clearStoreBranding).toBe('function');
  });

  it('exports seller analytics and ratings helpers', () => {
    expect(typeof shopApi.getSellerAnalytics).toBe('function');
    expect(typeof shopApi.submitProductRating).toBe('function');
    expect(typeof shopApi.getProductRatingsBySeller).toBe('function');
  });

  it('exports shipping zone + quote helpers', () => {
    expect(typeof shopApi.getSellerShippingZones).toBe('function');
    expect(typeof shopApi.getMyShippingZones).toBe('function');
    expect(typeof shopApi.saveMyShippingZones).toBe('function');
    expect(typeof shopApi.quoteShipping).toBe('function');
  });
});
