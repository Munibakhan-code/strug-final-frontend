import client from './client';

export const getMe = (userId) => client.get(`/user/${userId}`).then(r => r.data);
export const getUserById = (id) => client.get(`/user/${id}`).then(r => r.data);
export const updateUser = (id, data) => client.put(`/user/${id}`, data).then(r => r.data);
export const getStoreProfile = (id) => client.get(`/user/${id}/store_profile`).then(r => r.data);
export const updateStoreProfile = (id, data) => client.put(`/user/${id}/store_profile`, data).then(r => r.data);

const STORE_BRANDING_COLUMN = { logo: 'profile_pic_url', cover: 'cover_url', banner: 'banner_url' };

// Upload a store storefront branding image (type: 'logo' | 'cover' | 'banner') → blob + column write.
export const uploadStoreBranding = (id, file, type) => {
  const fd = new FormData();
  fd.append('image', file);
  fd.append('type', type);
  return client.post(`/user/${id}/store_profile/branding`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};

// Branding is uploaded via POST .../branding. There is no DELETE on that route
// (it 400s). Clear the column on PUT /store_profile instead.
export async function clearStoreBranding(id, type) {
  const column = STORE_BRANDING_COLUMN[type] || 'banner_url';
  try {
    return await updateStoreProfile(id, { [column]: null });
  } catch (err) {
    if (err?.response?.status === 400) {
      return updateStoreProfile(id, { [column]: '' });
    }
    throw err;
  }
}

export const getDocumentVerification = () => client.get('/user/me/document-verification').then(r => r.data);
export const submitDocumentVerification = ({ documentType, file }) => {
  const fd = new FormData();
  fd.append('document_type', documentType);
  fd.append('document', file);
  return client.post('/user/me/document-verification', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
};
export const applySellerStatus = (userId) => client.patch(`/user/${userId}/activate-seller`).then(r => r.data);
// Self-service account deletion (#395). Backend soft-deletes (account_status='deleted') so the
// account is immediately unusable but recoverable; caller must clear local auth afterwards.
export const deleteMyAccount = (userId) => client.delete(`/user/${userId}`).then(r => r.data);
export const saveAddress = (data) => client.patch('/user/address', data).then(r => r.data);
// Multi-address book (server-backed)
export const getAddresses = () => client.get('/user/addresses').then(r => r.data);
export const addAddress = (data) => client.post('/user/addresses', data).then(r => r.data);
export const deleteAddress = (addressId) => client.delete(`/user/addresses/${addressId}`).then(r => r.data);
export const setDefaultAddress = (addressId) => client.patch(`/user/addresses/${addressId}/default`).then(r => r.data);
export const changePassword = (data) => client.patch('/auth/change-password', data).then(r => r.data);
// Mark the one-time Welcome hub as seen for this account (server-side, per-account).
export const markWelcomeSeen = () => client.post('/auth/welcome-seen').then(r => r.data);
export const applyReferralCode = (code) => client.post('/referral/apply', { ref_code: code }).then(r => r.data);
// Checkout friend-code only — never creates a permanent Recruit link.
export { bindCheckoutReferralCode, getCheckoutReferralCode, clearCheckoutReferralCode } from './referral.js';
export const getReferralEarnings = () => client.get('/referral/earnings').then(r => r.data);
// Range-aware referral tracker: lifetime + this-period totals, prev-period delta, daily
// earnings trend, cleared-vs-pending split, referred-user count (#281).
export const getReferralAnalytics = (range) => client.get(`/referral/analytics/overview?range=${range}`).then(r => r.data);
export const getMyReferralCode = () => client.get('/referral/my-code').then(r => r.data);
export const getMyAppliedCode = () => client.get('/referral/my').then(r => r.data);
export const getWalletBalance = () => {
  return client.get('/referral/wallet-balance')
    .then(r => {
      const bal = r.data?.balance != null ? parseFloat(r.data.balance) : null;
      if (bal === null) return { balance: parseFloat(localStorage.getItem('strug_wallet_balance') ?? '0.00') };
      return r.data;
    })
    .catch(() => ({ balance: parseFloat(localStorage.getItem('strug_wallet_balance') ?? '0.00') }));
};
export const getWalletTransactions = () => client.get('/referral/wallet-transactions').then(r => r.data?.data ?? []).catch(() => []);

