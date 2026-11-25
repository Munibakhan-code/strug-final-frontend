import client from './client';

// Aggregate view across food/product/courier — the three verticals with no timeout/expiry
// safety net (unlike rides), so an abandoned order can otherwise sit unresolved and silently
// keep a driver "busy" and unmatchable forever with no indication anywhere in their UI.
export const getMyDriverOrders = () =>
  client.get('/driver-profile/me/orders').then((r) => r.data?.data ?? []);

export const cancelDriverOrder = (vertical, orderId, reason) =>
  client
    .patch(`/driver-profile/me/orders/${vertical}/${orderId}/cancel`, { reason })
    .then((r) => r.data);
