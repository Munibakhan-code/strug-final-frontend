import client from './client';

// Categories
export const getFreelanceCategories = () =>
  client.get('/freelance-categories').then(r => r.data);

// Subcategories
export const getFreelanceSubcategories = (categoryId) =>
  client
    .get(`/freelance-categories/${categoryId}/subcategories`)
    .then(r => r.data);