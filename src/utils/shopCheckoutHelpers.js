import { getLocationItem } from './userLocation.js';

// Reads default through the per-account (guest → per-tab) location namespacing helper so buyer
// coords never bleed across accounts. Tests may inject a plain `{ getItem }` to bypass it.
const namespacedLocationStore = { getItem: (base) => getLocationItem(base) };

/** Read buyer delivery coordinates saved during address capture. */
export function readBuyerDeliveryCoords(storage = namespacedLocationStore) {
  const lat = parseFloat(storage?.getItem?.('strug_user_lat'));
  const lng = parseFloat(storage?.getItem?.('strug_user_lng'));
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

/** Build POST /product-order payload for one cart line (Shop checkout). */
export function buildProductOrderPayload({
  item,
  payMethod,
  paymentIntentId,
  productTypeId,
  deliveryMode,
  deliveryAddr,
  deliveryFee,
  platformFee,
  tax,
  deliveryInstructions,
  promoCode = null,
  referralCode = null,
  coords = readBuyerDeliveryCoords(),
}) {
  const needsAddress =
    deliveryMode === 'delivery' || deliveryMode === 'ship_by_seller';
  const code = referralCode != null ? String(referralCode).trim() : '';
  return {
    variation_id: item?.variation_id != null ? Number(item.variation_id) : null,
    qty: item?.qty ?? 1,
    payment_method: payMethod,
    payment_intent_id: paymentIntentId ?? null,
    product_type_id: item?.product_type_id ?? productTypeId ?? null,
    delivery_address: needsAddress ? (deliveryAddr || null) : null,
    delivery_lat: needsAddress ? coords.lat : null,
    delivery_lng: needsAddress ? coords.lng : null,
    delivery_fee: deliveryFee ?? 0,
    platform_fee: platformFee ?? 0,
    tax: tax ?? 0,
    delivery_instructions: deliveryInstructions || null,
    ...(promoCode ? { promo_code: promoCode } : {}),
    ...(code ? { referral_code: code } : {}),
  };
}

export function extractProductOrderId(response) {
  return response?.order_id ?? response?.data?.order_id ?? null;
}

/** Map product_order.status → FoodTrackingPage stage index. */
export const PRODUCT_ORDER_STATUS_STAGE = {
  pending: 0,
  confirmed: 0,
  driver_assigned: 1,
  shipped: 1,
  picked_up: 2,
  fulfilled: 3,
  delivered: 3,
};

export function productOrderStatusToStage(status) {
  if (!status) return undefined;
  return PRODUCT_ORDER_STATUS_STAGE[status];
}
