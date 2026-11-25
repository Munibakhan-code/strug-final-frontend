import client from './client';

export const getExperiences = (params) => client.get('/experiences', { params }).then(r => r.data);
export const getExperience = (id) => client.get(`/experiences/${id}`).then(r => r.data);
export const getExperienceSessions = (id) => client.get(`/experiences/${id}/sessions`).then(r => r.data);
export const bookExperience = (id, data) => client.post(`/experiences/${id}/book`, data).then(r => r.data);
