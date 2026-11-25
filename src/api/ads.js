import client from './client';

// Ads Manager API client. All ads endpoints are JWT-auth'd and wrap their
// payload as { successful, data, ... }; these helpers return the raw wrapper so
// callers can read `.data` (and `.checklist` on account/me).

// ── Account / onboarding (/ads-manager) ──────────────────────────────────────
export const getAdsAccount = () =>
  client.get('/ads-manager/account/me').then((r) => r.data);
export const initAdsAccount = (currency = 'CAD') =>
  client.post('/ads-manager/account/init', { currency }).then((r) => r.data);
export const signAdsTos = () =>
  client.post('/ads-manager/account/tos/sign').then((r) => r.data);
export const updateAdsProfile = (data) =>
  client.put('/ads-manager/account/profile', data).then((r) => r.data);

// ── Ads wallet (/ads-wallet) — funded by an internal core→ads transfer ───────
export const getAdsWallet = () =>
  client.get('/ads-wallet/balance').then((r) => r.data);
export const adsWalletTopup = (amount) =>
  client.post('/ads-wallet/topup', { amount }).then((r) => r.data);

// ── Core wallet (/work-wallet) — Stripe-funded, then transferred into ads ────
export const getCoreWalletBalance = () =>
  client.get('/work-wallet/balance').then((r) => r.data);
export const coreWalletTopup = (amount) =>
  client.post('/work-wallet/topup', { amount }).then((r) => r.data);
export const coreWalletTopupConfirm = (payment_intent_id) =>
  client.post('/work-wallet/topup/confirm', { payment_intent_id }).then((r) => r.data);

// ── Campaigns (/ads-campaign) ────────────────────────────────────────────────
export const getCampaignTaxonomy = () =>
  client.get('/ads-campaign/system/taxonomy').then((r) => r.data);
export const createCampaign = (data) =>
  client.post('/ads-campaign/create', data).then((r) => r.data);
export const listCampaigns = (params) =>
  client.get('/ads-campaign/me', { params }).then((r) => r.data);
export const setCampaignStatus = (id, status) =>
  client.patch(`/ads-campaign/${id}/status`, { status }).then((r) => r.data);
export const deleteCampaign = (id) =>
  client.delete(`/ads-campaign/${id}`).then((r) => r.data);

// ── Creative (/ads-creative) — text creative, no upload needed ───────────────
export const attachCreative = (campaignId, data) =>
  client.post(`/ads-creative/${campaignId}`, data).then((r) => r.data);

// ── Business profile & brands (/ads-manager) ─────────────────────────────────
export const listBrands = () =>
  client.get('/ads-manager/workspace/brands').then((r) => r.data);
export const createBrand = (data) =>
  client.post('/ads-manager/workspace/brands', data).then((r) => r.data);

// ── Targeting (/ads-targeting) — optional ────────────────────────────────────
export const getTargetingTaxonomies = () =>
  client.get('/ads-targeting/system/taxonomies').then((r) => r.data);
export const getTargeting = (campaignId) =>
  client.get(`/ads-targeting/${campaignId}`).then((r) => r.data);
export const setTargeting = (campaignId, data) =>
  client.post(`/ads-targeting/${campaignId}`, data).then((r) => r.data);
export const estimateReach = (campaignId) =>
  client.post(`/ads-targeting/${campaignId}/estimate-reach`).then((r) => r.data);

// ── Analytics (/ads-analytics) ───────────────────────────────────────────────
export const getAdsDashboard = () =>
  client.get('/ads-analytics/dashboard').then((r) => r.data);
export const getCampaignSummary = (id) =>
  client.get(`/ads-analytics/campaign/${id}/summary`).then((r) => r.data);
export const getCampaignTimeSeries = (id) =>
  client.get(`/ads-analytics/campaign/${id}/time-series`).then((r) => r.data);
export const getCampaignDemographics = (id) =>
  client.get(`/ads-analytics/campaign/${id}/demographics`).then((r) => r.data);
export const getCampaignRoas = (id) =>
  client.get(`/ads-analytics/campaign/${id}/roas`).then((r) => r.data);
export const getCampaignDiagnostics = (id) =>
  client.get(`/ads-analytics/campaign/${id}/diagnostics`).then((r) => r.data);
// Returns the raw CSV text so the caller can trigger a browser download.
export const exportCampaignCsv = (id) =>
  client.get(`/ads-analytics/campaign/${id}/export/csv`, { responseType: 'blob' }).then((r) => r.data);

// ── Consumer-side ad event tracking (/ad-engine) ─────────────────────────────
// Fired when a sponsored post is shown (impression) or its CTA clicked (click).
// Best-effort: callers ignore failures so ad tracking never breaks the feed.
export const trackAdEvent = (campaign_id, event_type) =>
  client.post('/ad-engine/track-event', { campaign_id, event_type }).then((r) => r.data);
