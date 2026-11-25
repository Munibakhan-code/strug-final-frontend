import client from './client';

export const createReservation = (data) => client.post('/reservation', data).then(r => r.data);
export const getMyReservations = () => client.get('/reservation/me').then(r => r.data);
export const getVendorReservations = (vendor_id) => client.get('/reservation', { params: { vendor_id } }).then(r => r.data);
export const updateReservationStatus = (id, status) => client.patch(`/reservation/${id}`, { status }).then(r => r.data);

export const getBookableRestaurants = (params) =>
  client.get('/reservation/restaurants', { params }).then(r => r.data);
export const getBookableRestaurant = (vendorId) =>
  client.get(`/reservation/restaurants/${vendorId}`).then(r => r.data);
export const getReservationAvailability = (params) =>
  client.get('/reservation/availability', { params }).then(r => r.data);

export const updateReservationSettings = (vendorId, data) =>
  client.put(`/reservation/vendors/${vendorId}/settings`, data).then(r => r.data);
export const createSeatingArea = (vendorId, data) =>
  client.post(`/reservation/vendors/${vendorId}/seating`, data).then(r => r.data);
export const createRestaurantTable = (vendorId, data) =>
  client.post(`/reservation/vendors/${vendorId}/tables`, data).then(r => r.data);
export const deleteRestaurantTable = (vendorId, tableId) =>
  client.delete(`/reservation/vendors/${vendorId}/tables/${tableId}`).then(r => r.data);
