import client from './client';

export const getVehicles = (params) => client.get('/vehicle', { params }).then((r) => r.data);
export const getVehicle = (id) => client.get(`/vehicle/${id}`).then((r) => r.data);
export const getAllAutomotiveVehicles = () => client.get('/vehicle/automotive/all').then((r) => r.data);
export const getMyDriverVehicles = () =>
  client.get('/vehicle/me').then((r) => r.data?.data ?? r.data ?? []);
export const getDriverVehicles = (driverId) =>
  client.get(`/vehicle/driver/${driverId}`).then((r) => r.data);
export const createDriverVehicle = (data) =>
  client.post('/vehicle', data).then((r) => r.data?.data ?? r.data);

// Create vehicle for automotive provider (no driver profile required)
export const createAutomotiveVehicle = (data) =>
  client.post('/vehicle/automotive', data, { timeout: 120000 }).then((r) => r.data?.data ?? r.data);
// Update vehicle for automotive provider (with file upload support)
export const updateAutomotiveVehicle = (vehicleId, data) =>
  client.put(`/vehicle/automotive/${vehicleId}`, data, { timeout: 120000 }).then((r) => r.data?.data ?? r.data);
// Bulk-import vehicles from a CSV (server downloads the images/video columns' URLs itself).
export const bulkImportAutomotiveVehicles = (formData) =>
  client.post('/vehicle/automotive/bulk-import', formData, { timeout: 20 * 60 * 1000 }).then((r) => r.data);
export const updateDriverVehicle = (vehicleId, data) =>
  client.put(`/vehicle/${vehicleId}`, data).then((r) => r.data?.data ?? r.data);
export const deleteDriverVehicle = (vehicleId) =>
  client.delete(`/vehicle/${vehicleId}`).then((r) => r.data);
export const getVehicleTypes = () => client.get('/vehicle-types').then((r) => r.data);
export const getRideshareVehicleTypes = () =>
  client.get('/vehicle-types/rideshare/catalog').then((r) => r.data?.data ?? r.data ?? []);

// Test drive request API functions
export const createTestDriveRequest = (data) =>
  client.post('/test-drive', data).then((r) => r.data);
export const getMyTestDriveRequests = () =>
  client.get('/test-drive/my-requests').then((r) => r.data);
export const getSellerTestDriveRequests = () =>
  client.get('/test-drive/seller-requests').then((r) => r.data);
export const getBookedTestDriveTimes = (vehicleId, date) =>
  client.get(`/test-drive/vehicle/${vehicleId}/booked-times`, { params: { date } }).then((r) => r.data);
export const getTestDriveRequest = (id) =>
  client.get(`/test-drive/${id}`).then((r) => r.data);
export const updateTestDriveRequestStatus = (id, status) =>
  client.put(`/test-drive/${id}/status`, { status }).then((r) => r.data);
export const cancelTestDriveRequest = (id) =>
  client.delete(`/test-drive/${id}`).then((r) => r.data);

const RIDESHARE_VEHICLE_TYPE_NAMES = new Set([
  'economy',
  'comfort',
  'premium',
  'suv',
  'xl',
  'accessible',
]);

/** Filter vehicle_types rows to rideshare booking classes (fallback if catalog unavailable). */
export function filterRideshareVehicleTypes(types) {
  const rows = Array.isArray(types) ? types : [];
  const filtered = rows.filter((t) =>
    RIDESHARE_VEHICLE_TYPE_NAMES.has(String(t?.name ?? '').toLowerCase()),
  );
  const order = [...RIDESHARE_VEHICLE_TYPE_NAMES];
  return filtered.sort(
    (a, b) =>
      order.indexOf(String(a?.name ?? '').toLowerCase()) -
      order.indexOf(String(b?.name ?? '').toLowerCase()),
  );
}
