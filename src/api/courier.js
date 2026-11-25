import client from './client';

export const getCourierOrders = () => client.get('/courier-order').then(r => r.data);
// Pending, unassigned orders for an online courier to claim (driver job feed).
export const getAvailableCourierOrders = () => client.get('/courier-order', { params: { available: true } }).then(r => r.data);
export const getCourierOrder = (id) => client.get(`/courier-order/${id}`).then(r => r.data);
export const createCourierOrder = (data) => client.post('/courier-order', data).then(r => r.data);
// Resolve (get-or-create) the caller's courier_customer row; user_id comes from the token.
export const ensureCourierCustomer = () => client.get('/courier-customer/me').then(r => r.data);
// Resolve (get-or-create) the caller's courier_service_provider row — makes the user an
// eligible courier (required by the available-orders feed + accept/pickup/deliver).
export const ensureCourierProvider = () => client.get('/courier-service-provider/me').then(r => r.data);
// The authenticated courier's completed deliveries + total earnings (79% of price).
export const getCourierEarnings = () => client.get('/courier-order/earnings').then(r => r.data);
export const acceptCourierOrder = (id) => client.put(`/courier-order/${id}/accept`).then(r => r.data);
export const addCourierOrderToRun = (id) => client.put(`/courier-order/${id}/claim-additional`).then(r => r.data);
// pickup/deliver are PUT on the backend (were mistakenly PATCH → 404/405).
export const pickupCourierOrder = (id) => client.put(`/courier-order/${id}/pickup`).then(r => r.data);
export const deliverCourierOrder = (id) => client.put(`/courier-order/${id}/deliver`).then(r => r.data);
export const declineCourierOrder = (id) => client.put(`/courier-order/${id}/decline`).then(r => r.data);

// #460: courier used to add up two hardcoded numbers (per-vehicle + per-package) with no route
// involved, so it quoted a price before a pickup or drop-off existed. Price the real route instead.
export const getCourierFareEstimates = (pickup, dropoff, packageType, urgent) =>
  client.post('/courier-order/fare-estimates', { pickup, dropoff, packageType, urgent }).then(r => r.data);

// Live nearby-courier preview for the booking screen — mirrors getNearbyRides (rideshare).
export const getNearbyCouriers = (params) => client.get('/courier-order/nearby', { params }).then(r => r.data);

// No-login tracking link — whoever the sender shares it with can watch delivery status
// without an account. Deliberately hits the unauthenticated endpoint via the raw client
// (no bearer token required, and the response is already scoped server-side to a minimal,
// price-free shape).
export const getPublicCourierTracking = (token) => client.get(`/courier-order/track/${token}`).then(r => r.data);
