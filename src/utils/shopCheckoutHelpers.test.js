/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  buildProductOrderPayload,
  extractProductOrderId,
  productOrderStatusToStage,
  readBuyerDeliveryCoords,
} from './shopCheckoutHelpers.js';

describe('readBuyerDeliveryCoords', () => {
  it('reads finite lat/lng from storage', () => {
    const storage = {
      getItem: (key) => ({ strug_user_lat: '43.65', strug_user_lng: '-79.38' }[key]),
    };
    expect(readBuyerDeliveryCoords(storage)).toEqual({ lat: 43.65, lng: -79.38 });
  });
});

describe('buildProductOrderPayload', () => {
  it('includes delivery coords for delivery mode', () => {
    const payload = buildProductOrderPayload({
      item: { variation_id: 9, qty: 2 },
      payMethod: 'wallet',
      productTypeId: 1,
      deliveryMode: 'delivery',
      deliveryAddr: '47 Moon Valley Dr',
      deliveryFee: 1.99,
      platformFee: 2,
      tax: 0.5,
      coords: { lat: 43.65, lng: -79.38 },
    });
    expect(payload).toMatchObject({
      variation_id: 9,
      qty: 2,
      delivery_address: '47 Moon Valley Dr',
      delivery_lat: 43.65,
      delivery_lng: -79.38,
      delivery_fee: 1.99,
      platform_fee: 2,
      tax: 0.5,
    });
  });

  it('omits delivery coords for pickup', () => {
    const payload = buildProductOrderPayload({
      item: { variation_id: 9, qty: 1 },
      payMethod: 'wallet',
      productTypeId: 1,
      deliveryMode: 'pickup',
      deliveryAddr: '47 Moon Valley Dr',
      coords: { lat: 43.65, lng: -79.38 },
    });
    expect(payload.delivery_lat).toBeNull();
    expect(payload.delivery_lng).toBeNull();
    expect(payload.delivery_address).toBeNull();
  });

  it('persists address for ship_by_seller', () => {
    const payload = buildProductOrderPayload({
      item: { variation_id: 9, qty: 1 },
      payMethod: 'card',
      productTypeId: 1,
      deliveryMode: 'ship_by_seller',
      deliveryAddr: '12 Shipping Lane',
      deliveryFee: 22,
      coords: { lat: 31.5, lng: 74.3 },
    });
    expect(payload).toMatchObject({
      delivery_address: '12 Shipping Lane',
      delivery_lat: 31.5,
      delivery_lng: 74.3,
      delivery_fee: 22,
    });
  });
});

describe('extractProductOrderId', () => {
  it('reads order_id from API shapes', () => {
    expect(extractProductOrderId({ order_id: 12 })).toBe(12);
    expect(extractProductOrderId({ data: { order_id: 15 } })).toBe(15);
  });
});

describe('productOrderStatusToStage', () => {
  it('maps fulfillment statuses to tracking stages', () => {
    expect(productOrderStatusToStage('confirmed')).toBe(0);
    expect(productOrderStatusToStage('driver_assigned')).toBe(1);
    expect(productOrderStatusToStage('picked_up')).toBe(2);
    expect(productOrderStatusToStage('fulfilled')).toBe(3);
  });
});
