import client from './client.js';

export const getWishlist = (userId) => client.get(`/wishlist/${userId}`).then(r => r.data);
export const searchWishlistItems = (q, type) => client.get('/wishlist/search', { params: { q, type } }).then(r => r.data);
export const addWishlistItem = (data) => client.post('/wishlist', data).then(r => r.data);
export const removeWishlistItem = (itemId) => client.delete(`/wishlist/${itemId}`).then(r => r.data);
export const contributeToWishlist = (itemId, amount, note) => client.post(`/wishlist/${itemId}/contribute`, { amount, note }).then(r => r.data);
export const claimWishlistItem = (itemId) => client.post(`/wishlist/${itemId}/claim`).then(r => r.data);
