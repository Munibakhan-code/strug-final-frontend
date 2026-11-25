import client from './client';

// Properties (sale / preconstruction listings)
export const getProperties = (params) => client.get('/property/', { params }).then(r => r.data);
export const getMyProperties = (params) => client.get('/property/mine', { params }).then(r => r.data);
export const getProperty = (id) => client.get(`/property/${id}`).then(r => r.data);
export const createProperty = (data) => client.post('/property/', data).then(r => r.data);
export const updateProperty = (id, data) => client.put(`/property/${id}`, data).then(r => r.data);
export const deleteProperty = (id) => client.delete(`/property/${id}`).then(r => r.data);

// Media / floor plans / updates
export const addPropertyImages = (id, images) => client.post(`/property/${id}/images`, { images }).then(r => r.data);
export const deletePropertyImage = (id, imageId) => client.delete(`/property/${id}/images/${imageId}`).then(r => r.data);
export const createFloorPlan = (id, data) => client.post(`/property/${id}/floor-plans`, data).then(r => r.data);
// Uploads a floor plan image; the backend stores the original and runs the pluggable
// background-removal step. Returns { image_url, original_image_url, image_processed }.
export const uploadFloorPlanImage = (file) => { const fd = new FormData(); fd.append('image', file); return client.post('/property/floor-plans/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data); };
export const updateFloorPlan = (id, floorPlanId, data) => client.put(`/property/${id}/floor-plans/${floorPlanId}`, data).then(r => r.data);
export const deleteFloorPlan = (id, floorPlanId) => client.delete(`/property/${id}/floor-plans/${floorPlanId}`).then(r => r.data);
export const getPropertyUpdates = (id) => client.get(`/property/${id}/updates`).then(r => r.data);
export const createPropertyUpdate = (id, data) => client.post(`/property/${id}/updates`, data).then(r => r.data);
export const updatePropertyUpdate = (id, updateId, data) => client.put(`/property/${id}/updates/${updateId}`, data).then(r => r.data);
export const deletePropertyUpdate = (id, updateId) => client.delete(`/property/${id}/updates/${updateId}`).then(r => r.data);

// Saves / follows / saved searches
export const saveProperty = (id) => client.post(`/property/${id}/save`).then(r => r.data);
export const unsaveProperty = (id) => client.delete(`/property/${id}/save`).then(r => r.data);
export const followProperty = (id) => client.post(`/property/${id}/follow`).then(r => r.data);
export const unfollowProperty = (id) => client.delete(`/property/${id}/follow`).then(r => r.data);
export const getSavedSearches = (params) => client.get('/property/saved-searches', { params }).then(r => r.data);
export const createSavedSearch = (data) => client.post('/property/saved-searches', data).then(r => r.data);
export const updateSavedSearch = (id, data) => client.patch(`/property/saved-searches/${id}`, data).then(r => r.data);
export const deleteSavedSearch = (id) => client.delete(`/property/saved-searches/${id}`).then(r => r.data);
export const runSavedSearchAlerts = () => client.post('/property/saved-searches/run-alerts').then(r => r.data);

// Leads / capabilities
export const getPropertyLeads = () => client.get('/property/leads/mine').then(r => r.data);
export const getPropertyAnalytics = () => client.get('/property/analytics/mine').then(r => r.data);
export const getMyPropertyEngagement = (id) => client.get(`/property/${id}/my-engagement`).then(r => r.data);
export const updateInquiryStatus = (id, status) => client.patch(`/property/inquiries/${id}`, { status }).then(r => r.data);
export const updateViewingStatus = (id, status) => client.patch(`/property/viewings/${id}`, { status }).then(r => r.data);
export const getSellerCapabilities = () => client.get('/property/capabilities/me').then(r => r.data);
/** Grant a seller capability. Realtor / precon are active immediately (no KYC review). */
export const grantSellerCapability = (capability, meta = {}) =>
  client.post('/property/capabilities', { capability, ...meta }).then(r => r.data);
export const publishProperty = (id, publish = true) =>
  client.post(`/property/${id}/publish`, { publish }).then(r => r.data);
export const reportProperty = (id, data) =>
  client.post(`/property/${id}/report`, data).then(r => r.data);

// Rental listings
export const getRentalListings = (params) => client.get('/rental-listing/', { params }).then(r => r.data);
export const getRentalListing = (id) => client.get(`/rental-listing/${id}`).then(r => r.data);
export const createRentalListing = (data) => client.post('/rental-listing/', data).then(r => r.data);
export const updateRentalListing = (id, data) => client.put(`/rental-listing/${id}`, data).then(r => r.data);
export const deleteRentalListing = (id) => client.delete(`/rental-listing/${id}`).then(r => r.data);

// Rental orders (bookings)
export const createRentalOrder = (data) => client.post('/rental-order/', data).then(r => r.data);
export const getRentalOrders = () => client.get('/rental-order/').then(r => r.data);
export const acceptRentalOrder = (id) => client.put(`/rental-order/${id}/accept`).then(r => r.data);
export const declineRentalOrder = (id) => client.put(`/rental-order/${id}/decline`).then(r => r.data);

// Property viewings & inquiries
export const getAppointments = () => client.get('/appointments').then(r => r.data);
export const createPropertyViewing = (propertyId, data) => client.post(`/property/${propertyId}/viewing`, data).then(r => r.data);
export const createPropertyInquiry = (propertyId, data) => client.post(`/property/${propertyId}/inquiry`, data).then(r => r.data);
/** Cancel a property viewing by viewing_id (preferred). Falls back to legacy appointment delete. */
export const cancelPropertyViewing = (viewingId, appointmentId = null) => {
  if (viewingId != null && viewingId !== '') {
    return client.patch(`/property/viewings/${viewingId}`, { status: 'cancelled' }).then(r => r.data);
  }
  if (appointmentId != null && appointmentId !== '') {
    return client.delete(`/appointments/${appointmentId}`).then(r => r.data);
  }
  return Promise.reject(new Error('viewing_id or appointment_id required'));
};

// Listing photos
export const addListingPic = (data) => client.post('/rental-listing-pics/', data).then(r => r.data);
export const getRentalListingPics = (listingId) => client.get(`/rental-listing-pics/listing/${listingId}`).then(r => r.data);
export const uploadListingPhoto = (file) => { const fd = new FormData(); fd.append('image', file); return client.post('/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data); };
