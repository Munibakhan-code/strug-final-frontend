import client from './client';

export const createStripeIntent = (amount, options = {}) =>
  client.post('/payments/stripe/create-intent', {
    amount,
    currency: options.currency ?? 'cad',
    ride_request_id: options.ride_request_id,
    idempotency_key: options.idempotency_key,
    purpose: options.purpose,
    vertical: options.vertical,
    items: options.items,
    tip: options.tip,
    shipping_mode: options.shipping_mode,
    item_source: options.item_source,
    seller_id: options.seller_id,
    shipping_country: options.shipping_country,
    shipping_address: options.shipping_address,
    shipping_city: options.shipping_city,
    shipping_lat: options.shipping_lat,
    shipping_lng: options.shipping_lng,
    // Server re-validates the code and charges the discounted total — the promo has to
    // travel with the payment, not just with the order row.
    promo_code: options.promo_code,
    booking_id: options.booking_id,
    booking_listing_id: options.booking_listing_id,
    start_date: options.start_date,
    end_date: options.end_date,
    guests: options.guests,
    quantity: options.quantity,
    start_time: options.start_time,
    end_time: options.end_time,
  }).then(r => r.data);

export const createPaypalOrder = (amount, options = {}) =>
  client.post('/payments/paypal/create-order', {
    amount,
    ride_request_id: options.ride_request_id,
    purpose: options.purpose,
    vertical: options.vertical,
    items: options.items,
    tip: options.tip,
    shipping_mode: options.shipping_mode,
    item_source: options.item_source,
    seller_id: options.seller_id,
    shipping_country: options.shipping_country,
    shipping_address: options.shipping_address,
    shipping_city: options.shipping_city,
    shipping_lat: options.shipping_lat,
    shipping_lng: options.shipping_lng,
    promo_code: options.promo_code,
    booking_id: options.booking_id,
    booking_listing_id: options.booking_listing_id,
    start_date: options.start_date,
    end_date: options.end_date,
    guests: options.guests,
    quantity: options.quantity,
    start_time: options.start_time,
    end_time: options.end_time,
  }).then(r => r.data);

export const capturePaypalOrder = (orderID, bookingId) =>
  client.post('/payments/paypal/capture-order', {
    orderID,
    ...(bookingId != null ? { booking_id: bookingId } : {}),
  }).then(r => r.data);

export const createSetupIntent = () =>
  client.post('/payments/setup-intent').then(r => r.data);

export const getPaymentMethods = () =>
  client.get('/payments/payment-methods').then(r => r.data);

export const removePaymentMethod = (id) =>
  client.delete(`/payments/payment-methods/${id}`).then(r => r.data);
