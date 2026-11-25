import client from './client';

// Store profile (re-exported here so shop verticals import from one module)
export {
  getStoreProfile,
  updateStoreProfile,
  uploadStoreBranding,
  clearStoreBranding,
} from './user.js';

// Products
export const getProducts = (params) => client.get('/product-listing/', { params }).then(r => r.data);
export const getProduct = (id) => client.get(`/product-listing/${id}`).then(r => r.data);
export const createProduct = (data) => client.post('/product-listing/', data).then(r => r.data);
export const updateProduct = (id, data) => client.put(`/product-listing/${id}`, data).then(r => r.data);
export const deleteProduct = (id) => client.delete(`/product-listing/${id}`).then(r => r.data);

// Product types (ids are env-specific — resolve by name at runtime)
export const getProductTypes = () => client.get('/product-type/').then(r => r.data);

// Digital Listings
export const getDgListings = (sellerId, params) => client.get(`/dg-content/listings/${sellerId}`, { params }).then(r => r.data);
export const createDgListing = (data) => client.post('/dg-content/', data).then(r => r.data);
export const updateDgListing = (id, data) => client.put(`/dg-content/${id}`, data).then(r => r.data);
export const deleteDgListing = (id) => client.delete(`/dg-content/${id}`).then(r => r.data);

// Cart
export const getMyCart = (buyerId) => client.get(`/product-cart/buyer/${buyerId}`).then(r => r.data);
export const addToCart = (data) => client.post('/product-cart/', data).then(r => r.data);
export const updateCartItem = (cartId, data) => client.put(`/product-cart/${cartId}`, data).then(r => r.data);
export const removeFromCart = (cartId) => client.delete(`/product-cart/${cartId}`).then(r => r.data);

// Orders
export const getMyOrders = (buyerId) => client.get(`/product-order/buyer/${buyerId}`).then(r => r.data);
export const getSellerOrders = (sellerId) => client.get(`/product-order/seller/${sellerId}`).then(r => r.data);
export const createOrder = (data) => client.post('/product-order/', data).then(r => r.data);
export const getOrder = (id) => client.get(`/product-order/${id}`).then(r => r.data);
export const fulfillOrder = (id) => client.patch(`/product-order/${id}/fulfill`).then(r => r.data);
export const confirmOrder = (id) => client.patch(`/product-order/${id}/confirm`).then(r => r.data);
export const shipOrder = (id, tracking_number) => client.patch(`/product-order/${id}/ship`, { tracking_number }).then(r => r.data);

// Seller analytics (GET /product-order/seller/analytics/overview)
export const getSellerAnalytics = (range = '28d') =>
  client.get('/product-order/seller/analytics/overview', { params: { range } }).then(r => r.data);

// Product ratings
export const getProductRatingsBySeller = (sellerId) =>
  client.get(`/product-ratings/seller/${sellerId}`).then(r => r.data);

export const submitProductRating = (data) =>
  client.post('/product-ratings/', data).then(r => r.data);

// Shipping zones (hybrid local delivery vs ship-by-seller quotes)
export const getSellerShippingZones = (sellerId) =>
  client.get(`/shipping/zones/${sellerId}`).then(r => r.data);
export const getMyShippingZones = () =>
  client.get('/shipping/zones').then(r => r.data);
export const saveMyShippingZones = (zones) =>
  client.put('/shipping/zones', { zones }).then(r => r.data);
export const quoteShipping = (body) =>
  client.post('/shipping/quote', body).then(r => r.data);

// Upload generic image
export const uploadImage = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return client.post('/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};
