import { describe, it, expect } from 'vitest';
import {
  wishlistImageUrl,
  wishlistMembershipKey,
  wishlistRefId,
  buildProductWishlistPayload,
  buildBookingWishlistPayload,
} from './wishlistAdd.js';

describe('wishlistMembershipKey / wishlistRefId', () => {
  it('keys product and booking refs', () => {
    expect(wishlistMembershipKey('product', 42)).toBe('product:42');
    expect(wishlistRefId({ variation_id: 9 }, 'product')).toBe(9);
    expect(wishlistRefId({ listingId: 3 }, 'booking')).toBe(3);
  });
});

describe('wishlistImageUrl', () => {
  it('rejects gradients and empty', () => {
    expect(wishlistImageUrl(null)).toBeNull();
    expect(wishlistImageUrl('linear-gradient(135deg,#000,#fff)')).toBeNull();
  });

  it('keeps http urls', () => {
    expect(wishlistImageUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
  });
});

describe('buildProductWishlistPayload', () => {
  it('requires variation_id and positive price', () => {
    expect(buildProductWishlistPayload({ name: 'Lamp', price: 40 }).ok).toBe(false);
    expect(buildProductWishlistPayload({ name: 'Lamp', price: 0, variation_id: 9 }).ok).toBe(false);
  });

  it('builds product payload', () => {
    const r = buildProductWishlistPayload({
      name: 'Velvet chair',
      price: 120,
      variation_id: 42,
      imageUrl: 'https://cdn.example/c.jpg',
    });
    expect(r.ok).toBe(true);
    expect(r.payload).toMatchObject({
      item_type: 'product',
      item_ref_id: 42,
      title: 'Velvet chair',
      price: 120,
      image_url: 'https://cdn.example/c.jpg',
    });
  });
});

describe('buildBookingWishlistPayload', () => {
  it('builds booking payload from listingId', () => {
    const r = buildBookingWishlistPayload({
      name: 'Styling session',
      price: 200,
      listingId: 8,
      category: 'Interior',
    });
    expect(r.ok).toBe(true);
    expect(r.payload).toMatchObject({
      item_type: 'booking',
      item_ref_id: 8,
      title: 'Styling session',
      price: 200,
      description: 'Interior',
    });
  });
});
