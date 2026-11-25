import client from './client';

// Driver-facing product-order delivery lifecycle. Backend support already existed
// (routes/product-order-routes.js) but had zero frontend callers until the unified
// driver offer feed added a "product" branch alongside ride/food/courier.
export const acceptProductOrder = (id) => client.patch(`/product-order/${id}/accept`).then(r => r.data);
export const declineProductOrder = (id) => client.patch(`/product-order/${id}/decline`).then(r => r.data);
export const pickupProductOrder = (id) => client.patch(`/product-order/${id}/picked-up`).then(r => r.data);
export const deliverProductOrder = (id) => client.patch(`/product-order/${id}/deliver`).then(r => r.data);
