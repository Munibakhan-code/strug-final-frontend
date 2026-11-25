import client from './client';

// Service providers (doctors/specialists/automotive/etc — anything backed by appointment_service_providers)
export const getMedicalProviders = (params) => client.get('/appointment_service_providers', { params }).then(r => r.data);
export const getMedicalProvider = (id) => client.get(`/appointment_service_providers/${id}`).then(r => r.data);
export const createServiceProviderProfile = (data) => client.post('/appointment_service_providers', data).then(r => r.data);
export const updateServiceProviderProfile = (id, data) =>
  client.put(`/appointment_service_providers/${id}`, data).then((r) => r.data);

// Service categories (medical specialties)
export const getMedicalCategories = () => client.get('/appointment_service_category').then(r => r.data);

// Appointments
export const getAppointments = () => client.get('/appointments').then(r => r.data);
export const getAppointment = (id) => client.get(`/appointments/${id}`).then(r => r.data);
export const createAppointment = (data) => client.post('/appointments', data).then(r => r.data);
export const confirmAppointment = (id) => client.put(`/appointments/${id}/confirm`).then(r => r.data);
export const declineAppointment = (id) => client.put(`/appointments/${id}/decline`).then(r => r.data);
export const cancelAppointment = (id) => client.delete(`/appointments/${id}`).then(r => r.data);
