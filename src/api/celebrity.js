// celebrity.js
import client from './client';

// =========================================
// Celebrity Profile APIs
// =========================================

/**
 * Get current user's celebrity profile
 */
export const getCelebrityProfile = () =>
  client.get('/celebrity/profile').then(r => r.data);

/**
 * Create celebrity profile
 */
export const createCelebrityProfile = (data) =>
  client.post('/celebrity/profile', data).then(r => r.data);

/**
 * Update celebrity profile
 */
export const updateCelebrityProfile = (data) =>
  client.put('/celebrity/profile', data).then(r => r.data);

// =========================================
// Celebrity Listing APIs
// =========================================

/**
 * Get all active celebrity listings with pagination and filters
 */
export const getCelebrityListings = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/celebrity/listings', { params: cleanParams }).then(r => r.data);
};

/**
 * Get a single celebrity listing by ID
 */
export const getCelebrityListing = (id) =>
  client.get(`/celebrity/listings/${id}`).then(r => r.data);

/**
 * Get my listing (celebrity's own listing)
 */
export const getMyCelebrityListing = () =>
  client.get('/celebrity/listings/my-listing').then(r => r.data);

/**
 * Create a new celebrity listing (only one per celebrity)
 */
export const createCelebrityListing = (data) =>
  client.post('/celebrity/listings', data).then(r => r.data);

/**
 * Update celebrity listing (celebrity's own listing)
 */
export const updateCelebrityListing = (data) =>
  client.put('/celebrity/listings', data).then(r => r.data);

/**
 * Delete celebrity listing (soft delete)
 */
export const deleteCelebrityListing = () =>
  client.delete('/celebrity/listings').then(r => r.data);

/**
 * Update listing status (Publish/Unpublish)
 */
export const updateCelebrityListingStatus = (status) =>
  client.patch('/celebrity/listings/status', { status }).then(r => r.data);

/**
 * Upload celebrity images (profile/cover)
 */
export const uploadCelebrityImage = async (file) => {
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
export const uploadCelebrityImages = async (files = []) => {
  const uploaded = [];
  for (const file of files) {
    const res = await uploadCelebrityImage(file);
    const url = res?.data?.url || res?.url || res?.data?.image || res?.image;
    uploaded.push(url);
  }
  return uploaded;
};

// =========================================
// Celebrity Booking APIs
// =========================================

/**
 * Create a booking request (buyer)
 */
export const createCelebrityBooking = (data) =>
  client.post('/celebrity/bookings', data).then(r => r.data);

/**
 * Get my bookings (as buyer)
 */
export const getMyCelebrityBookings = () =>
  client.get('/celebrity/bookings/my-bookings').then(r => r.data);

/**
 * Get received bookings (as celebrity)
 */
export const getReceivedCelebrityBookings = () =>
  client.get('/celebrity/bookings/received-bookings').then(r => r.data);

/**
 * Get a single booking by ID
 */
export const getCelebrityBooking = (id) =>
  client.get(`/celebrity/bookings/${id}`).then(r => r.data);

/**
 * Celebrity approves a booking request
 */
export const approveCelebrityBooking = (bookingId) =>
  client.patch(`/celebrity/bookings/${bookingId}/approve`).then(r => r.data);

/**
 * Celebrity rejects a booking request
 */
export const rejectCelebrityBooking = (bookingId) =>
  client.patch(`/celebrity/bookings/${bookingId}/reject`).then(r => r.data);

/**
 * Buyer completes payment for an approved booking
 */
export const payCelebrityBooking = (bookingId) =>
  client.post(`/celebrity/bookings/${bookingId}/pay`).then(r => r.data);

/**
 * Celebrity marks booking as recording
 */
export const markCelebrityBookingRecording = (bookingId) =>
  client.patch(`/celebrity/bookings/${bookingId}/recording`).then(r => r.data);

/**
 * Celebrity delivers video for a booking
 */
export const deliverCelebrityBookingVideo = (bookingId, video_url) =>
  client.patch(`/celebrity/bookings/${bookingId}/deliver`, { video_url }).then(r => r.data);

/**
 * Buyer marks booking as completed (after receiving video)
 */
export const completeCelebrityBooking = (bookingId) =>
  client.patch(`/celebrity/bookings/${bookingId}/complete`).then(r => r.data);

/**
 * Cancel a booking (only if PENDING)
 */
export const cancelCelebrityBooking = (bookingId) =>
  client.patch(`/celebrity/bookings/${bookingId}/cancel`).then(r => r.data);

// =========================================
// Celebrity Wallet APIs
// =========================================

/**
 * Get wallet details
 */
export const getCelebrityWallet = () =>
  client.get('/celebrity/wallet').then(r => r.data);

/**
 * Get wallet transactions with filters
 */
export const getCelebrityWalletTransactions = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/celebrity/wallet/transactions', { params: cleanParams }).then(r => r.data);
};

/**
 * Create a withdrawal request
 */
export const createCelebrityWithdrawalRequest = (data) =>
  client.post('/celebrity/wallet/withdraw', data).then(r => r.data);

/**
 * Get withdrawal requests
 */
export const getCelebrityWithdrawalRequests = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/celebrity/wallet/withdrawals', { params: cleanParams }).then(r => r.data);
};

/**
 * Get a single withdrawal request by ID
 */
export const getCelebrityWithdrawalRequest = (id) =>
  client.get(`/celebrity/wallet/withdrawals/${id}`).then(r => r.data);

// =========================================
// Celebrity Review APIs
// =========================================

/**
 * Create a review for a completed booking
 */
export const createCelebrityReview = (data) =>
  client.post('/celebrity/reviews', data).then(r => r.data);

/**
 * Get reviews for a specific listing
 */
export const getCelebrityListingReviews = (listingId, params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get(`/celebrity/reviews/listing/${listingId}`, { params: cleanParams }).then(r => r.data);
};

/**
 * Get reviews for a specific celebrity
 */
export const getCelebrityReviews = (celebrityProfileId, params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get(`/celebrity/reviews/celebrity/${celebrityProfileId}`, { params: cleanParams }).then(r => r.data);
};

/**
 * Get reviews for the authenticated celebrity (my reviews)
 */
export const getMyCelebrityReviews = (params = {}) => {
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });
  return client.get('/celebrity/reviews/my-reviews', { params: cleanParams }).then(r => r.data);
};

// =========================================
// Utility Functions
// =========================================

export const getTotalPages = (total, limit) => Math.ceil(total / limit);

export const formatCelebrityBookingStatus = (status) => {
  const map = {
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    RECORDING: 'Recording',
    DELIVERED: 'Delivered',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled'
  };
  return map[status] || status;
};

export const formatCelebrityPaymentStatus = (status) => {
  const map = {
    PENDING: 'Pending',
    PAID: 'Paid',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded'
  };
  return map[status] || status;
};

export const getCelebrityBookingStatusColor = (status) => {
  const map = {
    PENDING: '#f59e0b',
    ACCEPTED: '#2563eb',
    RECORDING: '#8b5cf6',
    DELIVERED: '#06b6d4',
    COMPLETED: '#059669',
    CANCELLED: '#6b7280'
  };
  return map[status] || '#6b7280';
};

export const getCelebrityPaymentStatusColor = (status) => {
  const map = {
    PENDING: '#f59e0b',
    PAID: '#059669',
    FAILED: '#ef4444',
    CANCELLED: '#6b7280',
    REFUNDED: '#f59e0b'
  };
  return map[status] || '#6b7280';
};

export const formatCelebrityMessageType = (type) => {
  const map = {
    MYSELF: 'For Myself',
    SOMEONE_ELSE: 'For Someone Else'
  };
  return map[type] || type;
};