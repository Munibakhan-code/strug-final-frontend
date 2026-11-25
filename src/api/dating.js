import client from './client';

export const getDatingMe = () => client.get('/dating/me').then((r) => r.data);
export const updateDatingProfile = (data) => client.put('/dating/profile', data).then((r) => r.data);
export const uploadDatingPhoto = (file) => {
  const fd = new FormData();
  fd.append('image', file);
  return client.post('/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export const getDatingDiscover = (params) => client.get('/dating/discover', { params }).then((r) => r.data);
export const getDatingLikesYou = (params) => client.get('/dating/likes-you', { params }).then((r) => r.data);
export const createDatingSwipe = (data) => client.post('/dating/swipes', data).then((r) => r.data);
export const getDatingCrossedPaths = () => client.get('/dating/crossed-paths').then((r) => r.data);
export const updateDatingCrossedPathSettings = (data) => client.patch('/dating/crossed-paths/settings', data).then((r) => r.data);
export const recordDatingCrossedPathEvent = (data) => client.post('/dating/crossed-paths/events', data).then((r) => r.data);
export const getDatingMatches = () => client.get('/dating/matches').then((r) => r.data);
export const openDatingMatchChat = (id) => client.post(`/dating/matches/${id}/chat`).then((r) => r.data);
export const unmatchDatingMatch = (id) => client.patch(`/dating/matches/${id}/unmatch`).then((r) => r.data);
export const blockDatingMatch = (id) => client.post(`/dating/matches/${id}/block`).then((r) => r.data);

export const joinBlindDatingQueue = (data) => client.post('/dating/blind/join', data).then((r) => r.data);
export const getBlindDatingSession = () => client.get('/dating/blind/session').then((r) => r.data);
export const requestBlindDatingReveal = (id) => client.post(`/dating/blind/sessions/${id}/reveal`).then((r) => r.data);
export const openBlindDatingChat = (id) => client.post(`/dating/blind/sessions/${id}/chat`).then((r) => r.data);
export const endBlindDatingSession = (id, data) => client.patch(`/dating/blind/sessions/${id}/end`, data).then((r) => r.data);
export const reportBlindDatingSession = (id, data) => client.post(`/dating/blind/sessions/${id}/report`, data).then((r) => r.data);
export const leaveBlindDatingQueue = () => client.delete('/dating/blind/queue').then((r) => r.data);

export const getWorthItPlans = (params) => client.get('/dating/worth-it/plans', { params }).then((r) => r.data);
export const getMyWorthItPlans = () => client.get('/dating/worth-it/my').then((r) => r.data);
export const getWorthItAddOnVendors = (params) => client.get('/dating/worth-it/add-on-vendors', { params }).then((r) => r.data);
export const createWorthItPlan = (data) => client.post('/dating/worth-it/plans', data).then((r) => r.data);
export const updateWorthItPlan = (id, data) => client.patch(`/dating/worth-it/plans/${id}`, data).then((r) => r.data);
export const publishWorthItPlan = (id) => client.patch(`/dating/worth-it/plans/${id}/publish`).then((r) => r.data);
export const cancelWorthItPlan = (id) => client.patch(`/dating/worth-it/plans/${id}/cancel`).then((r) => r.data);
export const sendWorthItInterest = (id, data) => client.post(`/dating/worth-it/plans/${id}/interest`, data).then((r) => r.data);
export const inviteToWorthItPlan = (id, data) => client.post(`/dating/worth-it/plans/${id}/invite`, data).then((r) => r.data);
export const confirmWorthItInterest = (id) => client.patch(`/dating/worth-it/interests/${id}/confirm`).then((r) => r.data);
export const linkWorthItRide = (id, data) => client.post(`/dating/worth-it/plans/${id}/ride-link`, data).then((r) => r.data);
export const updateWorthItAddOnPreferences = (id, data) => client.patch(`/dating/worth-it/plans/${id}/add-on-preferences`, data).then((r) => r.data);
export const respondWorthItInvite = (id, data) => client.patch(`/dating/worth-it/invites/${id}/respond`, data).then((r) => r.data);
export const getWorthItVendorAddOns = () => client.get('/dating/worth-it/vendor/add-ons').then((r) => r.data);
export const createWorthItAddOnPaymentIntent = (planId, addOnId) => client.post(`/dating/worth-it/plans/${planId}/add-ons/${addOnId}/payment-intent`).then((r) => r.data);
export const confirmWorthItAddOnPayment = (planId, addOnId, data) => client.patch(`/dating/worth-it/plans/${planId}/add-ons/${addOnId}/payment-confirm`, data).then((r) => r.data);
export const respondWorthItAddOnVendor = (planId, addOnId, data) => client.patch(`/dating/worth-it/plans/${planId}/add-ons/${addOnId}/vendor-response`, data).then((r) => r.data);
export const submitWorthItAddOnDeliveryProof = (planId, addOnId, data) => client.patch(`/dating/worth-it/plans/${planId}/add-ons/${addOnId}/delivery-proof`, data).then((r) => r.data);

export const getDatingSafetyHistory = () => client.get('/dating/safety/history').then((r) => r.data);
export const reportDatingEntity = (data) => client.post('/dating/report', data).then((r) => r.data);
export const getDatingBlockedAccounts = () => client.get('/dating/blocked').then((r) => r.data);
export const unblockDatingAccount = (userId) => client.delete(`/dating/blocked/${userId}`).then((r) => r.data);
