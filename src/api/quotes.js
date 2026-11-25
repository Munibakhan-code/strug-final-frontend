import client from './client';

// ── Categories ──────────────────────────────────────────────────────────────
// vertical = 'insurance' | 'mortgage'. Returns macros with nested leaf sub-types,
// each leaf carrying its form_schema (dynamic request-form fields).
// live=true (default) = launch set only. Pass live:false when resolving a past request's
// category that may have been taken off the live list but is still active for renewals.
export const getQuoteCategories = (vertical, { live = true } = {}) =>
  client.get('/quote-categories', { params: { vertical, ...(live ? { live: 1 } : {}) } }).then((r) => r.data);

// ── Requester: requests ─────────────────────────────────────────────────────
export const createQuoteRequest = (data) =>
  client.post('/quote-requests', data).then((r) => r.data);

// Preview providers that WOULD match a leaf category + city, without creating a request.
// params: { category_id, city, country? }. Returns [{ quote_provider_id, business_name,
// provider_type, rating, bio }].
export const previewMatchingProviders = (params) =>
  client.get('/quote-requests/match-preview', { params }).then((r) => r.data);

export const getMyQuoteRequests = () =>
  client.get('/quote-requests').then((r) => r.data);

export const getQuoteRequestHistory = () =>
  client.get('/quote-requests/history').then((r) => r.data);

export const getQuoteRequest = (id) =>
  client.get(`/quote-requests/${id}`).then((r) => r.data);

export const cancelQuoteRequest = (id) =>
  client.patch(`/quote-requests/${id}/cancel`).then((r) => r.data);

// ── Requester: selection, appointment & deal close ──────────────────────────
export const getQuoteAvailability = (requestId, quoteId) =>
  client.get(`/quote-requests/${requestId}/availability`, { params: { quote_id: quoteId } }).then((r) => r.data);

export const bookAppointment = (requestId, data) =>
  client.post(`/quote-requests/${requestId}/appointment`, data).then((r) => r.data);

export const confirmAppointment = (requestId) =>
  client.patch(`/quote-requests/${requestId}/appointment/confirm`).then((r) => r.data);

export const cancelAppointment = (requestId) =>
  client.patch(`/quote-requests/${requestId}/appointment/cancel`).then((r) => r.data);

export const closeDeal = (requestId) =>
  client.post(`/quote-requests/${requestId}/close-deal`).then((r) => r.data);

// Rate the selected provider after deal_closed. Body: { rating: 1-5, comment? }.
export const reviewQuoteDeal = (requestId, data) =>
  client.post(`/quote-requests/${requestId}/review`, data).then((r) => r.data);

// "Request more info" — opens a DM between requester and provider (existing chat).
// Requester must pass { provider_id } or { quote_id }. Provider needs neither.
// Returns { channel_id }.
export const contactProvider = (requestId, message, opts = {}) => {
  const body = {};
  if (message) body.message = message;
  if (opts.provider_id != null) body.provider_id = opts.provider_id;
  if (opts.quote_id != null) body.quote_id = opts.quote_id;
  return client.post(`/quote-requests/${requestId}/contact`, body).then((r) => r.data);
};

// ── Notifications ───────────────────────────────────────────────────────────
export const getQuoteNotifications = () =>
  client.get('/quote-notifications').then((r) => r.data);

export const getQuoteUnreadCount = () =>
  client.get('/quote-notifications/unread-count').then((r) => r.data);

export const markAllQuoteNotificationsRead = () =>
  client.patch('/quote-notifications/read-all').then((r) => r.data);

export const markQuoteNotificationRead = (id) =>
  client.patch(`/quote-notifications/${id}/read`).then((r) => r.data);

// ── Provider side (used by the provider dashboard / M2) ─────────────────────
// All provider endpoints are vertical-scoped (insurance | mortgage) so the two
// dashboards stay standalone and do not share registration state.
export const getMyProvider = (vertical) =>
  client.get('/quote-providers/me', { params: { vertical } }).then((r) => r.data);

export const saveMyProvider = (data) =>
  client.post('/quote-providers/me', data).then((r) => r.data);

export const setProviderActive = (vertical, is_active) =>
  client.patch('/quote-providers/me/active', { vertical, is_active }).then((r) => r.data);

export const addProviderCity = (vertical, city, country) =>
  client.post('/quote-providers/me/cities', { vertical, city, country }).then((r) => r.data);

export const removeProviderCity = (vertical, cityId) =>
  client.delete(`/quote-providers/me/cities/${cityId}`, { params: { vertical } }).then((r) => r.data);

export const addProviderCategory = (vertical, categoryId) =>
  client.post('/quote-providers/me/categories', { vertical, category_id: categoryId }).then((r) => r.data);

export const removeProviderCategory = (vertical, categoryId) =>
  client.delete(`/quote-providers/me/categories/${categoryId}`, { params: { vertical } }).then((r) => r.data);

export const getProviderInbox = (vertical) =>
  client.get('/quote-providers/me/requests', { params: { vertical } }).then((r) => r.data);

export const getProviderPipeline = (vertical) =>
  client.get('/quote-providers/me/pipeline', { params: { vertical } }).then((r) => r.data);

export const getProviderProspects = (vertical) =>
  client.get('/quote-providers/me/prospects', { params: { vertical } }).then((r) => r.data);

export const getProviderReviews = (vertical) =>
  client.get('/quote-providers/me/reviews', { params: { vertical } }).then((r) => r.data);

export const getProviderRequest = (vertical, id) =>
  client.get(`/quote-providers/me/requests/${id}`, { params: { vertical } }).then((r) => r.data);

export const sendQuote = (requestId, data) =>
  client.post(`/quote-requests/${requestId}/quotes`, data).then((r) => r.data);

export const withdrawQuote = (quoteId) =>
  client.patch(`/quote-requests/quotes/${quoteId}/withdraw`).then((r) => r.data);

export const getMyAvailability = (vertical) =>
  client.get('/quote-providers/me/availability', { params: { vertical } }).then((r) => r.data);

export const addAvailability = (vertical, slot_start, slot_end) =>
  client.post('/quote-providers/me/availability', { vertical, slot_start, slot_end }).then((r) => r.data);

export const removeAvailability = (vertical, slotId) =>
  client.delete(`/quote-providers/me/availability/${slotId}`, { params: { vertical } }).then((r) => r.data);
