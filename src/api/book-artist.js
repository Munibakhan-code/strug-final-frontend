// book-artist.js
import client from './client';

// =========================================
// Artist Profile APIs
// =========================================

/**
 * Get current user's artist profile
 */
export const getArtistProfile = () =>
  client.get('/book-artist/profile').then(r => r.data);

/**
 * Create artist profile
 */
export const createArtistProfile = (data) =>
  client.post('/book-artist/profile', data).then(r => r.data);

/**
 * Update artist profile
 */
export const updateArtistProfile = (data) =>
  client.put('/book-artist/profile', data).then(r => r.data);

// =========================================
// Artist Listing APIs
// =========================================

/**
 * Get all active artist listings with pagination and filters
 */
export const getArtistListings = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/book-artist/listings', { params: cleanParams }).then(r => r.data);
};

/**
 * Get a single artist listing by ID
 */
export const getArtistListing = (id) =>
  client.get(`/book-artist/listings/${id}`).then(r => r.data);

/**
 * Get my listings (artist's own listings)
 */
export const getMyArtistListings = () =>
  client.get('/book-artist/listings/my-listings').then(r => r.data);

/**
 * Create a new artist listing
 */
export const createArtistListing = (data) =>
  client.post('/book-artist/listings', data).then(r => r.data);

/**
 * Update an artist listing
 */
export const updateArtistListing = (id, data) =>
  client.put(`/book-artist/listings/${id}`, data).then(r => r.data);

/**
 * Delete an artist listing (soft delete)
 */
export const deleteArtistListing = (id) =>
  client.delete(`/book-artist/listings/${id}`).then(r => r.data);

/**
 * Update listing status (Publish/Unpublish)
 */
export const updateArtistListingStatus = (listingId, status) =>
  client.patch(`/book-artist/listings/${listingId}/status`, { status }).then(r => r.data);

/**
 * Upload artist images (profile/cover)
 */
export const uploadArtistImage = async (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return client.post('/photo', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,
    onUploadProgress: (e) => {
      const percent = Math.round((e.loaded * 100) / e.total);
      window.dispatchEvent(new CustomEvent('upload:progress', { detail: percent }));
    },
  }).then(r => r.data);
};

/**
 * Upload multiple images
 */
export const uploadArtistImages = async (files = []) => {
  const uploaded = [];
  for (const file of files) {
    const res = await uploadArtistImage(file);
    const url = res?.data?.url || res?.url || res?.data?.image || res?.image;
    uploaded.push(url);
  }
  return uploaded;
};

// =========================================
// Artist Booking APIs
// =========================================

/**
 * Create a booking request (buyer)
 */
export const createArtistBooking = (data) =>
  client.post('/book-artist/bookings', data).then(r => r.data);

/**
 * Get my bookings (as buyer)
 */
export const getMyArtistBookings = () =>
  client.get('/book-artist/bookings/my-bookings').then(r => r.data);

/**
 * Get received bookings (as artist)
 */
export const getReceivedArtistBookings = () =>
  client.get('/book-artist/bookings/received-bookings').then(r => r.data);

/**
 * Get a single booking by ID
 */
export const getArtistBooking = (id) =>
  client.get(`/book-artist/bookings/${id}`).then(r => r.data);

/**
 * Artist approves a booking request
 */
export const approveArtistBooking = (bookingId) =>
  client.patch(`/book-artist/bookings/${bookingId}/approve`).then(r => r.data);

/**
 * Artist rejects a booking request
 */
export const rejectArtistBooking = (bookingId) =>
  client.patch(`/book-artist/bookings/${bookingId}/reject`).then(r => r.data);

/**
 * Buyer completes payment for an approved booking
 */
export const payArtistBooking = (bookingId) =>
  client.post(`/book-artist/bookings/${bookingId}/pay`).then(r => r.data);

/**
 * Artist marks booking as completed (after event)
 */
export const completeArtistBooking = (bookingId) =>
  client.patch(`/book-artist/bookings/${bookingId}/complete`).then(r => r.data);

/**
 * Cancel a booking (only if PENDING)
 */
export const cancelArtistBooking = (bookingId) =>
  client.patch(`/book-artist/bookings/${bookingId}/cancel`).then(r => r.data);

// =========================================
// Artist Wallet APIs
// =========================================

/**
 * Get wallet details
 */
export const getArtistWallet = () =>
  client.get('/book-artist/wallet').then(r => r.data);

/**
 * Get wallet transactions with filters
 */
export const getArtistWalletTransactions = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/book-artist/wallet/transactions', { params: cleanParams }).then(r => r.data);
};

/**
 * Create a withdrawal request
 */
export const createArtistWithdrawalRequest = (data) =>
  client.post('/book-artist/wallet/withdraw', data).then(r => r.data);

/**
 * Get withdrawal requests
 */
export const getArtistWithdrawalRequests = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/book-artist/wallet/withdrawals', { params: cleanParams }).then(r => r.data);
};

/**
 * Get a single withdrawal request by ID
 */
export const getArtistWithdrawalRequest = (id) =>
  client.get(`/book-artist/wallet/withdrawals/${id}`).then(r => r.data);

// =========================================
// Artist Review APIs
// =========================================

/**
 * Create a review for a completed booking
 */
export const createArtistReview = (data) =>
  client.post('/book-artist/reviews', data).then(r => r.data);

/**
 * Get reviews for a specific listing
 */
export const getArtistListingReviews = (listingId, params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get(`/book-artist/reviews/listing/${listingId}`, { params: cleanParams }).then(r => r.data);
};

/**
 * Get reviews for a specific artist
 */
export const getArtistReviews = (artistProfileId, params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get(`/book-artist/reviews/artist/${artistProfileId}`, { params: cleanParams }).then(r => r.data);
};

// =========================================
// Utility Functions
// =========================================

export const getTotalPages = (total, limit) => Math.ceil(total / limit);

export const formatBookingStatus = (status) => {
  const map = { PENDING: 'Pending', ACCEPTED: 'Accepted', REJECTED: 'Rejected', CANCELLED: 'Cancelled', COMPLETED: 'Completed' };
  return map[status] || status;
};

export const formatPaymentStatus = (status) => {
  const map = { PENDING: 'Pending', PAID: 'Paid', FAILED: 'Failed', CANCELLED: 'Cancelled', REFUNDED: 'Refunded' };
  return map[status] || status;
};

export const getBookingStatusColor = (status) => {
  const map = { PENDING: '#f59e0b', ACCEPTED: '#2563eb', REJECTED: '#ef4444', CANCELLED: '#6b7280', COMPLETED: '#059669' };
  return map[status] || '#6b7280';
};

export const getPaymentStatusColor = (status) => {
  const map = { PENDING: '#f59e0b', PAID: '#059669', FAILED: '#ef4444', CANCELLED: '#6b7280', REFUNDED: '#f59e0b' };
  return map[status] || '#6b7280';
};