import client from './client';

export const getEmergencyContact = () =>
  client.get('/driver-safety/emergency-contact').then((r) => r.data?.data ?? null);

export const saveEmergencyContact = (data) =>
  client.put('/driver-safety/emergency-contact', data).then((r) => r.data?.data ?? null);

// Returns the incident row plus `support_alerted` — false when the environment has no safety
// inbox configured, in which case the UI must NOT tell the driver help is on the way.
export const triggerSos = (tripId) =>
  client.post(`/driver-safety/${tripId}/sos`).then((r) => ({
    ...(r.data?.data ?? {}),
    support_alerted: r.data?.support_alerted === true,
  }));

export const createShareLink = (tripId) =>
  client.post(`/driver-safety/${tripId}/share-link`).then((r) => r.data);

export const revokeShareLink = (tripId) =>
  client.delete(`/driver-safety/${tripId}/share-link`).then((r) => r.data);

// No-login tracking read — used by the public TripTrack page, never sends an auth header.
export const getTrackedTrip = (token) =>
  client.get(`/driver-safety/track/${token}`).then((r) => r.data);
