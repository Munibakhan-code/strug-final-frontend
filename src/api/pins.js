import client from './client';

// Pinboard — user-created visual pins.
export const getPins = (params) =>
  client.get('/pins', { params }).then((r) => r.data);
export const getMyPins = () =>
  client.get('/pins/mine').then((r) => r.data);
export const createPin = (data) =>
  client.post('/pins', data).then((r) => r.data);
export const deletePin = (id) =>
  client.delete(`/pins/${id}`).then((r) => r.data);

// Save-to-board (toggle) + the caller's saved board.
export const togglePinSave = (id) =>
  client.post(`/pins/${id}/save`).then((r) => r.data);
export const getSavedPins = () =>
  client.get('/pins/saved').then((r) => r.data);

// Comments.
export const getPinComments = (id) =>
  client.get(`/pins/${id}/comments`).then((r) => r.data);
export const addPinComment = (id, body) =>
  client.post(`/pins/${id}/comments`, { body }).then((r) => r.data);
export const deletePinComment = (commentId) =>
  client.delete(`/pins/comments/${commentId}`).then((r) => r.data);
