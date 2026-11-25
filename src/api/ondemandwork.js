import client from './client';

// ── On-Demand Work API (rideshare-style: hire the nearest worker in a category) ──

// Categories
export const getWorkCategories = () => client.get('/work-categories').then((r) => r.data);

// Discovery map — nearby available workers (public, no auth)
export const getNearbyWorkers = ({ category_slug, lat, lng, radius = 5, catalog = false } = {}) =>
  client.get('/workers/nearby', {
    params: {
      category_slug,
      lat,
      lng,
      radius,
      ...(catalog ? { catalog: 1 } : {}),
    },
  }).then((r) => r.data);

// Hirer — jobs
export const createWorkJob = (data) => client.post('/work-jobs', data).then((r) => r.data);
export const quoteWorkJob = (data) => client.post('/work-jobs/quote', data).then((r) => r.data);
export const getWorkJob = (id) => client.get(`/work-jobs/${id}`).then((r) => r.data);
export const getMyWorkJobs = () => client.get('/work-jobs').then((r) => r.data);
export const getWorkJobHistory = () => client.get('/work-jobs/history').then((r) => r.data);
export const submitWorkJob = (id) => client.patch(`/work-jobs/${id}/submit`).then((r) => r.data);
export const cancelWorkJob = (id, reason) => client.patch(`/work-jobs/${id}/cancel`, { reason }).then((r) => r.data);
// Notifications
export const getWorkNotifications = () => client.get('/work-notifications').then((r) => r.data);
export const markWorkNotificationsRead = () => client.patch('/work-notifications/read-all').then((r) => r.data);

// Wallet top-up (Stripe card)
export const getWorkWalletBalance = () => client.get('/work-wallet/balance').then((r) => r.data);
export const createWalletTopupIntent = (amount) => client.post('/work-wallet/topup', { amount }).then((r) => r.data);
export const confirmWalletTopup = (payment_intent_id) => client.post('/work-wallet/topup/confirm', { payment_intent_id }).then((r) => r.data);

export const directOfferWorkJob = (data) => client.post('/work-jobs/direct-offer', data).then((r) => r.data);
export const tipWorkJob = (id, amount) => client.post(`/work-jobs/${id}/tip`, { amount }).then((r) => r.data);
export const reviewWorkJob = (id, rating, comment) => client.post(`/work-jobs/${id}/review`, { rating, comment }).then((r) => r.data);
export const markWorkerNoShow = (id) => client.patch(`/work-jobs/${id}/no-show`).then((r) => r.data);
export const employerCancelJob = (id, reason) => client.patch(`/work-jobs/${id}/employer-cancel`, { reason }).then((r) => r.data);

// Worker — profile, services, availability
export const getWorkerMe = () => client.get('/workers/me').then((r) => r.data);
export const setWorkerAvailability = (is_available, lat, lng) =>
  client.patch('/workers/me/availability', { is_available, lat, lng }).then((r) => r.data);
export const addWorkerService = (category_id, rates = {}) =>
  client.post('/workers/me/services', { category_id, ...rates }).then((r) => r.data);
export const updateWorkerService = (categoryId, rates = {}) =>
  client.patch(`/workers/me/services/${categoryId}`, rates).then((r) => r.data);
export const removeWorkerService = (categoryId) => client.delete(`/workers/me/services/${categoryId}`).then((r) => r.data);
export const addWorkerPackage = (categoryId, data) =>
  client.post(`/workers/me/services/${categoryId}/packages`, data).then((r) => r.data);
export const removeWorkerPackage = (packageId) =>
  client.delete(`/workers/me/packages/${packageId}`).then((r) => r.data);

// Worker — offers & lifecycle
export const getWorkerOffers = () => client.get('/workers/me/offers').then((r) => r.data);
export const acceptWorkOffer = (jobId) => client.patch(`/workers/offers/${jobId}/accept`).then((r) => r.data);
export const declineWorkOffer = (jobId) => client.patch(`/workers/offers/${jobId}/decline`).then((r) => r.data);
export const getWorkerJobs = (params = {}) => client.get('/workers/me/jobs', { params }).then((r) => r.data);
export const workerJobEnRoute = (id) => client.patch(`/workers/jobs/${id}/en-route`).then((r) => r.data);
export const workerJobStart = (id) => client.patch(`/workers/jobs/${id}/start`).then((r) => r.data);
export const workerJobEnd = (id) => client.patch(`/workers/jobs/${id}/end`).then((r) => r.data);
export const getWorkerEarnings = () => client.get('/workers/me/earnings').then((r) => r.data);
// Worker — job cancellation
export const workerCancelJob = (jobId, reason) => client.patch(`/work-jobs/${jobId}/worker-cancel`, { reason }).then((r) => r.data);
// Worker — reliability
export const getWorkerReliability = () => client.get('/workers/me/reliability').then((r) => r.data);
// Worker — cancelled jobs list
export const getWorkerCancelledJobs = () => client.get('/workers/me/jobs/cancelled').then((r) => r.data);
// Worker — reliability audit trail
export const getWorkerReliabilityAudit = (params = {}) => client.get('/workers/me/reliability/audit', { params }).then((r) => r.data);
// Worker — reviews left by hirers, with lifetime average + count
export const getWorkerReviews = () => client.get('/workers/me/reviews').then((r) => r.data);
