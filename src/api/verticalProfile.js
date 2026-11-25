import client from './client';

// Per-vertical display identity (bug #3 — profile bleed). Each seller dashboard edits
// its OWN identity here instead of the shared /social-profile, so changes in e.g. the
// Rideshare or Restaurant dashboard never overwrite the user's main (Social) profile.
// Until a vertical is customized, the backend returns values inherited from the main
// profile, so the editor pre-fills sensibly.

export const getVerticalProfile = (vertical) =>
  client.get(`/vertical-profile/me/${encodeURIComponent(vertical)}`).then(r => r.data);

export const updateVerticalProfile = (vertical, data) =>
  client.patch(`/vertical-profile/me/${encodeURIComponent(vertical)}`, data).then(r => r.data);

export const updateVerticalProfileHandle = (vertical, handle) =>
  client.patch(`/vertical-profile/me/${encodeURIComponent(vertical)}/handle`, { handle }).then(r => r.data);

export const updateVerticalProfilePhoto = (vertical, file) => {
  const fd = new FormData();
  fd.append('photo', file);
  return client.patch(`/vertical-profile/me/${encodeURIComponent(vertical)}/photo`, fd).then(r => r.data);
};

export const updateVerticalProfileBanner = (vertical, file) => {
  const fd = new FormData();
  fd.append('banner', file);
  return client.patch(`/vertical-profile/me/${encodeURIComponent(vertical)}/banner`, fd).then(r => r.data);
};

export const getVerticalProfileByUser = (userId, vertical) =>
  client.get(`/vertical-profile/by-user/${userId}/${encodeURIComponent(vertical)}`).then(r => r.data);

export const getVerticalProfileByHandle = (handle) =>
  client.get(`/vertical-profile/by-handle/${encodeURIComponent(handle)}`).then(r => r.data);
