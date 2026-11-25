import client from './client';

export const getDiscounts = (params) => client.get('/discounts', { params }).then(r => r.data);
export const getMyDiscounts = () => client.get('/discounts/mine').then(r => r.data);
export const setListingDiscount = (data) => client.post('/discounts', data).then(r => r.data);
export const createDiscount = setListingDiscount;
export const validatePromoCode = (code, extra = {}) =>
  client.post('/discounts/validate', { code, ...extra }).then(r => r.data);
export const createPromotion = (data) => client.post('/discounts/promotions', data).then(r => r.data);
export const updatePromotion = (id, data) => client.patch(`/discounts/promotions/${id}`, data).then(r => r.data);
export const getMyPromotions = () => client.get('/discounts/promotions/mine').then(r => r.data);
export const getDiscountAnalytics = () => client.get('/discounts/analytics/mine').then(r => r.data);
export const reportDiscount = (data) => client.post('/discounts/report', data).then(r => r.data);
