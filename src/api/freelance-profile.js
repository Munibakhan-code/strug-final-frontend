import client from './client';

// Get current user's freelancer profile
export const getFreelancerProfile = () =>
  client.get('/freelancer-profile').then(r => r.data);

// Create freelancer profile
export const createFreelancerProfile = (data) =>
  client.post('/freelancer-profile', data).then(r => r.data);

// Update freelancer profile
export const updateFreelancerProfile = (data) =>
  client.put('/freelancer-profile', data).then(r => r.data);