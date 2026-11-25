// #334 Community Spaces REST client. Room lifecycle + roles; audio is handled
// separately by the WebRTC mesh client (spacesRTC.js).
import client from './client';

export const listSpaces = (communityId) =>
  client
    .get('/spaces', { params: communityId ? { community_id: communityId } : {} })
    .then((r) => r.data?.spaces ?? []);

// #6: previous (ended) spaces of people you follow.
export const listPastSpaces = (communityId) =>
  client
    .get('/spaces/past', { params: communityId ? { community_id: communityId } : {} })
    .then((r) => r.data?.spaces ?? []);

export const createSpace = (title, communityId) =>
  client.post('/spaces', { title, ...(communityId ? { community_id: communityId } : {}) }).then((r) => r.data);

export const getSpace = (id) => client.get(`/spaces/${id}`).then((r) => r.data);

export const joinSpace = (id) => client.post(`/spaces/${id}/join`).then((r) => r.data);

export const leaveSpace = (id) => client.post(`/spaces/${id}/leave`).then((r) => r.data);

export const endSpace = (id) => client.post(`/spaces/${id}/end`).then((r) => r.data);

export const setSpaceRole = (id, userId, role) =>
  client.patch(`/spaces/${id}/role`, { user_id: userId, role }).then((r) => r.data);

export const raiseHand = (id, raised) =>
  client.patch(`/spaces/${id}/hand`, { raised }).then((r) => r.data);
