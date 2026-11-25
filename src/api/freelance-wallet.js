import client from './client';

// Get wallet details
export const getFreelanceWallet = () =>
  client.get('/freelance-wallet').then(r => r.data);

// Get wallet transactions with filters
export const getFreelanceWalletTransactions = (params) =>
  client.get('/freelance-wallet/transactions', { params }).then(r => r.data);

// Create withdrawal request
export const createWithdrawalRequest = (data) =>
  client.post('/freelance-wallet/withdraw', data).then(r => r.data);

// Get withdrawal requests
export const getWithdrawalRequests = (params) =>
  client.get('/freelance-wallet/withdrawals', { params }).then(r => r.data);

// Get single withdrawal request
export const getWithdrawalRequest = (id) =>
  client.get(`/freelance-wallet/withdrawals/${id}`).then(r => r.data);