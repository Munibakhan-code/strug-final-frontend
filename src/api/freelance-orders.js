import client from './client';

// Get received orders for the freelancer
export const getFreelanceOrders = () =>
  client.get('/freelance-orders/received-orders').then(r => r.data);

// Get orders as buyer
export const getMyFreelanceOrders = () =>
  client.get('/freelance-orders/my-orders').then(r => r.data);

// Update order status (PENDING -> IN_PROGRESS -> DELIVERED)
export const updateFreelanceOrderStatus = (orderId, status) =>
  client.patch(`/freelance-orders/${orderId}/status`, { status }).then(r => r.data);

// Create order as buyer
export const createFreelanceOrder = (data) => {
  const code = data?.referral_code || (() => {
    try { return sessionStorage.getItem('checkout_referral_code') || ''; } catch { return ''; }
  })();
  const payload = { ...data };
  if (code && !payload.referral_code) payload.referral_code = String(code).trim();
  return client.post('/freelance-orders', payload).then(r => r.data);
};

// Cancel order (only if PENDING)
export const cancelFreelanceOrder = (orderId) =>
  client.patch(`/freelance-orders/${orderId}/cancel`).then(r => r.data);

// Complete order (only if DELIVERED)
export const completeFreelanceOrder = (orderId) =>
  client.patch(`/freelance-orders/${orderId}/complete`).then(r => r.data);

// Create review for completed order
export const createFreelanceReview = (data) =>
  client.post('/freelance-reviews', data).then(r => r.data);