// api/freelance-gig.js
import client from './client';

// Gigs
export const getFreelanceGigs = (params = {}) => {
  console.log('Fetching freelance gigs with params:', params);

  // Clean up params - remove undefined or null values
  const cleanParams = {};
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cleanParams[key] = params[key];
    }
  });

  return client.get('/freelance-gigs', { params: cleanParams })
    .then(r => r.data);
};

export const getFreelanceGig = (id) =>
  client.get(`/freelance-gigs/${id}`).then(r => r.data);

export const getMyFreelanceGigs = () =>
  client.get('/freelance-gigs/my-gigs').then(r => r.data);

export const createFreelanceGig = (data) =>
  client.post('/freelance-gigs', data).then(r => r.data);

export const updateFreelanceGig = (id, data) =>
  client.put(`/freelance-gigs/${id}`, data).then(r => r.data);

export const deleteFreelanceGig = (id) =>
  client.delete(`/freelance-gigs/${id}`).then(r => r.data);

export const updateFreelanceGigStatus = (id, status) =>
  client.patch(`/freelance-gigs/${id}/status`, { status }).then(r => r.data);

/**
 * Upload a single freelance gig image.
 * Returns backend response which should contain the uploaded image URL.
 */
export const uploadFreelanceImage = async (file) => {
  const fd = new FormData();
  fd.append('image', file);

  return client.post('/photo', fd, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 90000,
    onUploadProgress: (e) => {
      const percent = Math.round((e.loaded * 100) / e.total);
      window.dispatchEvent(
        new CustomEvent('upload:progress', {
          detail: percent,
        })
      );
    },
  }).then(r => r.data);
};

/**
 * Upload multiple images and return uploaded URLs.
 */
export const uploadFreelanceImages = async (files = []) => {
  const uploaded = [];

  for (const file of files) {
    const res = await uploadFreelanceImage(file);
    const url = res?.data?.url || res?.url || res?.data?.image || res?.image;
    uploaded.push(url);
  }

  return uploaded;
};