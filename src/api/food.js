import client from './client';


export const getVendors = (params) => client.get('/food/vendors', { params }).then(r => r.data);
export const getVendor = (id) => client.get(`/food/vendors/${id}`).then(r => r.data);
export const getMyVendor = (params) => client.get('/food/vendors/mine', { params }).then(r => r.data);
export const filterVendors = (params) => client.get('/food/vendors/filter', { params }).then(r => r.data);
export const createVendor = (data) => client.post('/food/vendors', data).then(r => r.data);
export const updateVendor = (id, data) => client.put(`/food/vendors/${id}`, data).then(r => r.data);

const VENDOR_BRANDING_COLUMN = { logo: 'logo_url', cover: 'cover_url', banner: 'banner_url' };

// Upload a storefront branding image (type: 'logo' | 'cover' | 'banner') → blob + column write.
export const uploadVendorBranding = (id, file, type) => {
  const fd = new FormData();
  fd.append('image', file);
  fd.append('type', type);
  return client.post(`/food/vendors/${id}/branding`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

// Branding is uploaded via POST .../branding. There is no DELETE on that route
// (it 400s). Clear the column on PUT /food/vendors/:id instead.
export async function clearVendorBranding(id, type) {
  const column = VENDOR_BRANDING_COLUMN[type] || 'banner_url';
  try {
    return await updateVendor(id, { [column]: null });
  } catch (err) {
    if (err?.response?.status === 400) {
      return updateVendor(id, { [column]: '' });
    }
    throw err;
  }
}

// Vendor type taxonomy. The user-facing feeds (Grocery/Floral/Catering) filter vendors by
// the TYPE NAME, so a store must be created against a vendor_type whose name matches exactly.
export const getVendorTypes = () => client.get('/vendor-type').then(r => r.data);
export const createVendorType = (vendor_type) => client.post('/vendor-type', { vendor_type }).then(r => r.data);

// Look up a vendor_type_id by NAME (case-insensitive) WITHOUT creating it. Returns null if
// absent. Use for read paths (e.g. the dashboard's existing-vendor status check) so they
// resolve the SAME id the store was created against, without polluting the table.
export const findVendorTypeIdByName = async (name) => {
  const want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  try {
    const types = await getVendorTypes();
    const match = (Array.isArray(types) ? types : []).find(
      t => String(t?.vendor_type || '').trim().toLowerCase() === want
    );
    return match?.vendor_type_id ?? null;
  } catch {
    return null;
  }
};

// Resolve a vendor_type_id by NAME (case-insensitive), creating the row if it doesn't exist.
// Prevents the "store goes nowhere" bug where a hard-coded id pointed at the wrong/absent type.
export const resolveVendorTypeId = async (name) => {
  const existing = await findVendorTypeIdByName(name);
  if (existing) return existing;
  try {
    const created = await createVendorType(name);
    return created?.vendor_type_id ?? null;
  } catch {
    return null;
  }
};


export const getFoodCategories = (params) => client.get('/food/categories', { params }).then(r => r.data);


export const getFoodItems = (params) => client.get('/food/items', { params }).then(r => r.data);
export const getFoodItem = (id) => client.get(`/food/items/${id}`).then(r => r.data);
export const createFoodItem = (data) => client.post('/food/items', data).then(r => r.data);
export const updateFoodItem = (id, data) => client.put(`/food/items/${id}`, data).then(r => r.data);
export const deleteFoodItem = (id) => client.delete(`/food/items/${id}`).then(r => r.data);
export const exportFoodInventoryCsv = (vendorId) =>
  client.get(`/food/vendor/${vendorId}/items/export.csv`, { responseType: 'blob' }).then(r => r.data);
export const importFoodInventoryCsv = (vendorId, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/food/vendor/${vendorId}/items/import.csv`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const getFoodInventoryAlerts = (vendorId) =>
  client.get(`/food/vendor/${vendorId}/inventory-alerts`).then(r => r.data);
export const getFoodReorderSuggestions = (vendorId, params = {}) =>
  client.get(`/food/vendor/${vendorId}/reorder-suggestions`, { params }).then(r => r.data);
export const getGrocerySubstitutionRecommendations = (vendorId, params = {}) =>
  client.get(`/food/vendor/${vendorId}/substitution-recommendations`, { params }).then(r => r.data);
export const getFoodVendorDisputes = (vendorId, params = {}) =>
  client.get(`/food/vendor/${vendorId}/disputes`, { params }).then(r => r.data);
export const createFoodOrderDispute = (orderId, data = {}) =>
  client.post(`/food/orders/${orderId}/disputes`, data).then(r => r.data);
export const updateFoodVendorDispute = (vendorId, disputeId, data = {}) =>
  client.patch(`/food/vendor/${vendorId}/disputes/${disputeId}`, data).then(r => r.data);
export const getFoodVendorClosures = (vendorId, params = {}) =>
  client.get(`/food/vendor/${vendorId}/closures`, { params }).then(r => r.data);
export const createFoodVendorClosure = (vendorId, data) =>
  client.post(`/food/vendor/${vendorId}/closures`, data).then(r => r.data);
export const updateFoodVendorClosure = (vendorId, closureId, data) =>
  client.patch(`/food/vendor/${vendorId}/closures/${closureId}`, data).then(r => r.data);
export const deleteFoodVendorClosure = (vendorId, closureId) =>
  client.delete(`/food/vendor/${vendorId}/closures/${closureId}`).then(r => r.data);
// Server-owned modifier catalog (groups + priced options). getFoodItemModifiers
// returns the groups with stable group_id/option_id; saveFoodItemModifiers does a
// full id-preserving replace (omitted ids are deleted server-side).
export const getFoodItemModifiers = (id) => client.get(`/food/items/${id}/modifiers`).then(r => r.data);
export const saveFoodItemModifiers = (id, groups) => client.put(`/food/items/${id}/modifiers`, { groups }).then(r => r.data);


export const autocompleteAddress = (q) => client.get('/food/autocomplete', { params: { q } }).then(r => r.data);


// Vendor-scoped (GET /food/orders 404s for any account without a food_vendor row) — for a
// customer's own order history use getMyFoodOrders below.
export const getFoodOrders = () => client.get('/food/orders').then(r => r.data);
export const getMyFoodOrders = () => client.get('/food/orders/mine').then(r => r.data);
export const getFoodVendorOrders = (vendorId) => client.get(`/food/vendor/${vendorId}/orders`).then(r => r.data);

// Vendor earnings ledger (available / pending / transactions) and Stripe Connect payouts.
export const getFoodVendorWallet = (params = {}) =>
  client.get('/food/vendor/me/wallet', { params }).then(r => r.data);
export const getFoodVendorWalletTransactions = (params = {}) =>
  client.get('/food/vendor/me/wallet/transactions', { params }).then(r => r.data);
export const getFoodVendorPayouts = (params = {}) =>
  client.get('/food/vendor/me/wallet/payouts', { params }).then(r => r.data);
export const requestFoodVendorPayout = (amount, params = {}) =>
  client.post('/food/vendor/me/wallet/payout-request', { amount }, { params }).then(r => r.data);
export const getFoodVendorConnectStatus = (params = {}) =>
  client.get('/food/vendor/me/wallet/connect/status', { params }).then(r => r.data);
export const startFoodVendorConnectOnboarding = ({ return_path, ...params } = {}) =>
  client.post('/food/vendor/me/wallet/connect/onboard', { return_path }, { params }).then(r => r.data);

export const adminGetFoodPayouts = (status) =>
  client.get('/food/vendor/admin/payouts', { params: status ? { status } : {} }).then(r => r.data);
export const adminApproveFoodPayout = (payoutId, note) =>
  client.post(`/food/vendor/admin/payouts/${payoutId}/approve`, { note }).then(r => r.data);
export const adminMarkFoodPayoutPaid = (payoutId, reference) =>
  client.post(`/food/vendor/admin/payouts/${payoutId}/mark-paid`, { reference }).then(r => r.data);
export const adminRejectFoodPayout = (payoutId, note) =>
  client.post(`/food/vendor/admin/payouts/${payoutId}/reject`, { note }).then(r => r.data);

export const getFoodOrder = (id) => client.get(`/food/orders/${id}`).then(r => r.data);
export const getFoodOrderDeliveryLocation = (id) => client.get(`/food/orders/${id}/delivery-location`).then(r => r.data);
export const getGroceryDeliveryAnalytics = (params = {}) => client.get('/food/grocery-delivery/analytics', { params }).then(r => r.data);
export const getGroceryDeliveryDispatch = (params = {}) => client.get('/food/grocery-delivery/dispatch', { params }).then(r => r.data);
export const reassignGroceryDelivery = (id, data = {}) => client.patch(`/food/grocery-delivery/${id}/reassign`, data).then(r => r.data);
export const resolveGroceryDelivery = (id, data = {}) => client.patch(`/food/grocery-delivery/${id}/resolve`, data).then(r => r.data);
export const getAdminDeliveryRuns = () => client.get('/food/admin/delivery-runs').then(r => r.data);
export const suggestDeliveryRunOffers = (batchId, data = {}) => client.post(`/food/delivery-runs/${batchId}/suggestions`, data).then(r => r.data);
export const createDeliveryRunOffer = (batchId, data = {}) => client.post(`/food/delivery-runs/${batchId}/offers`, data).then(r => r.data);
export const getDeliveryRunOffers = (batchId) => client.get(`/food/delivery-runs/${batchId}/offers`).then(r => r.data);
export const decideDeliveryRunOffer = (offerId, data = {}) => client.patch(`/food/delivery-runs/offers/${offerId}`, data).then(r => r.data);
export const adminUnbundleDeliveryRunOrder = (batchId, data = {}) => client.patch(`/food/admin/delivery-runs/${batchId}/unbundle`, data).then(r => r.data);
export const adminReassignDeliveryRunOrder = (batchId, data = {}) => client.patch(`/food/admin/delivery-runs/${batchId}/reassign`, data).then(r => r.data);
export const rescheduleGroceryDelivery = (id, data = {}) => client.patch(`/food/orders/${id}/reschedule-delivery`, data).then(r => r.data);
export const updateFoodOrder = (id, data) => client.put(`/food/orders/${id}`, data).then(r => r.data);
export const createFoodOrder = (data) => client.post('/food/orders', data).then(r => r.data);
export const acceptFoodOrder = (id) => client.put(`/food/orders/${id}/accept`).then(r => r.data);
// Add a same-vendor order to the driver's current run (order batching, v1) — the driver must
// already have a non-terminal order from the same vendor, or this 409s.
export const addFoodOrderToRun = (id) => client.put(`/food/orders/${id}/claim-additional`).then(r => r.data);
export const acceptStoreFoodOrder = (id) => client.patch(`/food/orders/${id}/vendor-accept`).then(r => r.data);
export const markFoodOrderPreparing = (id) => client.patch(`/food/orders/${id}/prepare`).then(r => r.data);
export const markGroceryOrderPacked = (id) => client.patch(`/food/orders/${id}/packed`).then(r => r.data);
export const updateGroceryHandoffChecklist = (id, data) => client.patch(`/food/orders/${id}/handoff-checklist`, data).then(r => r.data);
export const startFoodOrderPickupNavigation = (id) => client.patch(`/food/orders/${id}/navigate-to-store`).then(r => r.data);
export const arriveFoodOrderAtStore = (id) => client.patch(`/food/orders/${id}/arrive-at-store`).then(r => r.data);
export const markPickedUp = (id) => client.patch(`/food/orders/${id}/picked-up`).then(r => r.data);
// The backend requires the proof-of-delivery OTP sent to the customer at pickup
// (routes/food-routes.js PATCH /orders/:id/deliver) — omitting it always fails with "Invalid OTP code".
export const markDelivered = (id, otp, proof = {}) => {
  const payload = { ...proof };
  if (otp) payload.otp = otp;
  return client.patch(`/food/orders/${id}/deliver`, payload).then(r => r.data);
};
export const uploadFoodDeliveryProofPhoto = (id, file) => {
  const form = new FormData();
  form.append('image', file);
  return client.post(`/food/orders/${id}/delivery-proof-photo`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};
export const reportFoodDeliveryIssue = (id, data) => client.patch(`/food/orders/${id}/delivery-issue`, data).then(r => r.data);
export const checkoutFoodOrder = (id) => client.patch(`/food/orders/${id}/checkout`).then(r => r.data);
export const rejectFoodOrder = (id, reason) => client.put(`/food/orders/${id}/reject`, { rejection_reason: reason }).then(r => r.data);
export const createGrocerySubstitution = (id, data) => client.post(`/food/orders/${id}/substitutions`, data).then(r => r.data);
export const respondGrocerySubstitution = (id, substitutionId, data) => client.patch(`/food/orders/${id}/substitutions/${substitutionId}`, data).then(r => r.data);
// Customer self-serve cancel — only allowed while the order is still pending/confirmed
// (routes/food-routes.js PATCH /orders/:id/cancel), i.e. before the vendor starts preparing it.
export const cancelFoodOrder = (id) => client.patch(`/food/orders/${id}/cancel`).then(r => r.data);
export const declineFoodOrderDriver = (id) => client.put(`/food/orders/${id}/decline-driver`).then(r => r.data);
export const getDeliveryDrivers = () => client.get('/delivery-driver').then(r => r.data);
// Get-or-create the caller's delivery capability (driver_profile + driver_delivery_profile) —
// mirrors ensureCourierProvider(). Called when a driver turns Food/Shop on so the toggle
// actually grants dispatch-eligible capability, not just the preference flag.
export const ensureDeliveryDriver = () => client.get('/delivery-driver/me').then(r => r.data);
export const getAvailableFoodOrders = (params) => client.get('/food/orders/available', { params }).then(r => r.data);
// Real backend-persisted review (replaces the old localStorage-only cosmetic review cache) —
// one review per order (server upserts on resubmit). Only valid once the order is 'delivered'.
export const submitFoodReview = (orderId, rating, comment) => client.post(`/food/orders/${orderId}/review`, { rating, comment }).then(r => r.data);
export const getFoodVendorReviews = (vendorId, params) => client.get(`/food/vendors/${vendorId}/reviews`, { params }).then(r => r.data);

// Customer rates a completed food order (picked_up / delivered). Backend stores the
// review on the order and updates vendor rating + review_count for the seller Overview.
export const submitFoodOrderRating = (orderId, data) =>
  client.post(`/food/orders/${orderId}/rating`, data).then(r => r.data);

// Seller Reviews tab — all ratings for this vendor (newest first).
export const getFoodVendorRatings = (vendorId) =>
  client.get(`/food/vendor/${vendorId}/ratings`).then(r => r.data);
