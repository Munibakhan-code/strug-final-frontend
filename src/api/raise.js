import client from './client';

export const getMyDonations = () => client.get('/donation/mine').then(r => r.data);
export const getDonations = () => client.get('/donation').then(r => r.data);
export const getDonation = (id) => client.get(`/donation/${id}`).then(r => r.data);
export const createDonation = (data) => client.post('/donation', data).then(r => r.data);
export const confirmDonation = (id) => client.patch(`/donation/${id}/confirm`).then(r => r.data);
export const refundDonation = (id) => client.post(`/donation/${id}/refund`).then(r => r.data);
export const updateDonationFulfillment = (id, data) => client.patch(`/donation/${id}/fulfillment`, data).then(r => r.data);
export const getCampaignBackers = (projectId) => client.get(`/donation/project/${projectId}/backers`).then(r => r.data);

export const getCampaigns = (params = {}) => client.get('/projects', { params }).then(r => r.data);
export const getMyCampaigns = () => client.get('/projects/mine').then(r => r.data);
export const getCampaign = (id) => client.get(`/projects/${id}`).then(r => r.data);
export const createCampaign = (data) => client.post('/projects', data).then(r => r.data);
export const updateCampaign = (id, data) => client.put(`/projects/${id}`, data).then(r => r.data);

// Reward / pledge tiers
export const getRewardTiers = (projectId) => client.get(`/reward-tiers/project/${projectId}`).then(r => r.data);
export const createRewardTier = (data) => client.post('/reward-tiers', data).then(r => r.data);
export const updateRewardTier = (id, data) => client.put(`/reward-tiers/${id}`, data).then(r => r.data);
export const deleteRewardTier = (id) => client.delete(`/reward-tiers/${id}`).then(r => r.data);

// Campaign updates feed
export const getCampaignUpdates = (projectId) => client.get(`/campaign-updates/project/${projectId}`).then(r => r.data);
export const createCampaignUpdate = (data) => client.post('/campaign-updates', data).then(r => r.data);
export const updateCampaignUpdate = (id, data) => client.put(`/campaign-updates/${id}`, data).then(r => r.data);
export const deleteCampaignUpdate = (id) => client.delete(`/campaign-updates/${id}`).then(r => r.data);

// Creator payouts
export const getPayoutSummary = (projectId) => client.get(`/campaign-payouts/project/${projectId}/summary`).then(r => r.data);
export const getPayouts = (projectId) => client.get(`/campaign-payouts/project/${projectId}`).then(r => r.data);
export const withdrawCampaign = (projectId) => client.post(`/campaign-payouts/project/${projectId}/withdraw`).then(r => r.data);
