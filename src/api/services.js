import client from './client';

export const getServiceOrders = () => client.get('/service-order').then(r => r.data);
export const getServiceOrder = (id) => client.get(`/service-order/${id}`).then(r => r.data);
export const createServiceOrder = (data) => client.post('/service-order', data).then(r => r.data);
export const acceptServiceOrder = (id) => client.put(`/service-order/${id}/accept`).then(r => r.data);
export const declineServiceOrder = (id) => client.put(`/service-order/${id}/decline`).then(r => r.data);
export const arrivedServiceOrder = (id) => client.put(`/service-order/${id}`, { status: 'arrived' }).then(r => r.data);
export const startServiceOrder = (id) => client.patch(`/service-order/${id}/start`).then(r => r.data);
export const completeServiceOrder = (id) => client.patch(`/service-order/${id}/complete`).then(r => r.data);
export const createServiceListing = (data) => client.post('/services', data).then(r => r.data);
export const getServiceTypes = () => client.get('/service-type').then(r => r.data);
export const getServiceCategories = (service_type_id) => client.get('/service-category', { params: service_type_id ? { service_type_id } : undefined }).then(r => r.data);
export const getServiceProvider = (user_id) => client.get(`/user-service-provider/user/${user_id}`).then(r => r.data);
export const updateServiceProvider = (provider_id, data) => client.put(`/user-service-provider/${provider_id}`, data).then(r => r.data);
export const getMyServiceListings = () => client.get('/services/my').then(r => r.data);
