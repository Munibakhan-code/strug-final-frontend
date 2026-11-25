/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  shopCanAcceptOrders,
  productCanAddToCart,
  storeIsOpenFromProfile,
} from './shopAvailabilityHelpers.js';

describe('storeIsOpenFromProfile', () => {
  it('defaults to open when field is missing', () => {
    expect(storeIsOpenFromProfile(null)).toBe(true);
    expect(storeIsOpenFromProfile({})).toBe(true);
  });

  it('is false only when explicitly closed', () => {
    expect(storeIsOpenFromProfile({ is_open: false })).toBe(false);
    expect(storeIsOpenFromProfile({ is_open: true })).toBe(true);
  });
});

describe('shopCanAcceptOrders', () => {
  it('blocks inactive or closed shops', () => {
    expect(shopCanAcceptOrders({ isActive: false, isOpen: true })).toBe(false);
    expect(shopCanAcceptOrders({ isActive: true, isOpen: false })).toBe(false);
    expect(shopCanAcceptOrders({ isActive: true, isOpen: true })).toBe(true);
  });
});

describe('productCanAddToCart', () => {
  const openShop = { isActive: true, isOpen: true };
  const inStock = { isInStock: true };
  const outOfStock = { isInStock: false };

  it('allows in-stock products from open shops', () => {
    expect(productCanAddToCart(inStock, openShop)).toBe(true);
  });

  it('blocks out-of-stock products', () => {
    expect(productCanAddToCart(outOfStock, openShop)).toBe(false);
  });

  it('blocks all products when shop is closed', () => {
    expect(productCanAddToCart(inStock, { isActive: true, isOpen: false })).toBe(false);
  });
});
