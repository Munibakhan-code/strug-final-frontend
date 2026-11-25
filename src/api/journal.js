import client from './client.js';

const base = (channelId) => `/journal/${channelId}`;

// Highlights
export const getHighlights = (channelId) => client.get(`${base(channelId)}/highlights`).then(r => r.data);
export const addHighlight = (channelId, payload) => client.post(`${base(channelId)}/highlights`, payload).then(r => r.data);
export const updateHighlight = (channelId, id, payload) => client.patch(`${base(channelId)}/highlights/${id}`, payload).then(r => r.data);
export const deleteHighlight = (channelId, id) => client.delete(`${base(channelId)}/highlights/${id}`).then(r => r.data);

// Bucket List
export const getBucketList = (channelId) => client.get(`${base(channelId)}/bucket`).then(r => r.data);
export const addBucketItem = (channelId, payload) => client.post(`${base(channelId)}/bucket`, payload).then(r => r.data);
export const updateBucketItem = (channelId, id, payload) => client.patch(`${base(channelId)}/bucket/${id}`, payload).then(r => r.data);
export const deleteBucketItem = (channelId, id) => client.delete(`${base(channelId)}/bucket/${id}`).then(r => r.data);

// Time Capsules
export const getCapsules = (channelId) => client.get(`${base(channelId)}/capsules`).then(r => r.data);
export const addCapsule = (channelId, payload) => client.post(`${base(channelId)}/capsules`, payload).then(r => r.data);
export const contributeCapsule = (channelId, id, payload) => client.patch(`${base(channelId)}/capsules/${id}/contribute`, payload).then(r => r.data);
export const deleteCapsule = (channelId, id) => client.delete(`${base(channelId)}/capsules/${id}`).then(r => r.data);

// Monthly Memories
export const getMonthlyMemory = (channelId, year, month) =>
  client.get(`${base(channelId)}/monthly/${year}/${month}`).then(r => r.data);
