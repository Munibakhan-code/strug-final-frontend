import client from './client';

export const getTalents = (params) => client.get('/talent', { params }).then(r => r.data);
export const getTalent = (id) => client.get(`/talent/${id}`).then(r => r.data);
export const getTalentCategories = () => client.get('/talent-category').then(r => r.data);

export const getInfluencers = (params) => client.get('/influencer/', { params }).then(r => r.data);

export const getCamPosts = (params) => client.get('/cam-post', { params }).then(r => r.data);
export const createCamPostOrder = (data) => client.post('/cam-post-order', data).then(r => r.data);
