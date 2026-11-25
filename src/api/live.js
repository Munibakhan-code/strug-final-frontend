import client from './client';

// Cam posts (creator content / live recordings)
export const getCamPosts = (params) => client.get('/cam-post', { params }).then(r => r.data);
export const getCamPost = (id) => client.get(`/cam-post/${id}`).then(r => r.data);
export const createCamPost = (data) => client.post('/cam-post', data).then(r => r.data);
export const updateCamPost = (id, data) => client.put(`/cam-post/${id}`, data).then(r => r.data);
export const deleteCamPost = (id) => client.delete(`/cam-post/${id}`).then(r => r.data);

// Cam post orders (viewer purchases)
export const getCamPostOrders = () => client.get('/cam-post-order').then(r => r.data);
export const getCamPostOrder = (id) => client.get(`/cam-post-order/${id}`).then(r => r.data);
export const createCamPostOrder = (data) => client.post('/cam-post-order', data).then(r => r.data);

// Unified live browse — currently-live sessions on the modern live_session system
// (replaces the legacy /stream/status/live read path).
export const getLiveSessions = (params) =>
  client.get('/live-session/live', { params }).then((r) => r.data);

export const getBrowseCategories = (params) =>
  client.get('/live-session/categories/browse', { params }).then((r) => r.data);

export const resolveLiveCategory = (data) =>
  client.post('/live-streamer/categories/resolve', data).then((r) => r.data);

export const getCategoryVods = (categoryId) =>
  client.get(`/live-vod/category/${categoryId}`).then((r) => r.data);

export const getCategoryClips = (categoryId) =>
  client.get(`/live-vod/category/${categoryId}/clips`).then((r) => r.data);

export const getBrowseVods = (params) =>
  client.get('/live-vod/browse', { params }).then((r) => r.data);

/** Replay of live chat messages for a session (VOD / clip "Chat on Videos"). */
export const getSessionChatReplay = (sessionId) =>
  client.get(`/live-chat/replay/${sessionId}`).then((r) => r.data);

/** Record a VOD/clip view and return the updated count. */
export const recordVodView = (vodId) =>
  client.post(`/live-vod/${vodId}/view`).then((r) => r.data);

// Public channel header + current-live state by handle (unauthenticated, token-free) —
// powers /live/@handle deep links for logged-out/offline channels.
export const getPublicStreamer = (handle) => client.get(`/live-session/public/${handle}`).then(r => r.data);
// A specific session (+ published VOD) by handle — powers /live/@handle/:sessionId.
export const getPublicSession = (handle, sessionId) => client.get(`/live-session/public/${handle}/${sessionId}`).then(r => r.data);

// Public channel page data by handle: bio/profile + upcoming scheduled_streams +
// recent community posts. Powers the About + Schedule sections on the streamer profile.
export const getStreamerChannel = (handle) => client.get(`/live-community/channel/${handle}`).then(r => r.data);
export const getMyCommunityContent = () => client.get('/live-community/me').then(r => r.data);
export const createLiveSchedule = (data) => client.post('/live-community/schedule', data).then(r => r.data);
export const createLiveCommunityPost = (data) => client.post('/live-community/post', data).then(r => r.data);
export const deleteLiveSchedule = (scheduleId) => client.delete(`/live-community/schedule/${scheduleId}`).then(r => r.data);
export const deleteLiveCommunityPost = (postId) => client.delete(`/live-community/post/${postId}`).then(r => r.data);
export const voteLivePoll = (option_id) => client.post('/live-community/poll/vote', { option_id }).then(r => r.data);
export const likeLiveCommunityPost = (post_id) => client.post(`/live-community/post/${post_id}/like`).then(r => r.data);

// VOD (past broadcasts)
export const getLiveVod = (vodId) => client.get(`/live-vod/${vodId}`).then(r => r.data);
export const getStreamerVods = (handle) => client.get(`/live-vod/streamer/${handle}`).then(r => r.data);
export const getMyVods = () => client.get('/live-vod/me').then(r => r.data);
export const updateLiveVod = (vodId, data) => client.patch(`/live-vod/${vodId}`, data).then(r => r.data);
export const deleteLiveVod = (vodId) => client.delete(`/live-vod/${vodId}`).then(r => r.data);
export const uploadSessionThumbnail = (sessionId, file) => {
  const fd = new FormData();
  fd.append('image', file);
  return client.post(`/live-session/${sessionId}/thumbnail`, fd).then((r) => r.data);
};
export const uploadVodThumbnail = (vodId, file) => {
  const fd = new FormData();
  fd.append('image', file);
  return client.post(`/live-vod/${vodId}/thumbnail`, fd).then((r) => r.data);
};
export const createLiveClip = (payload) => client.post('/live-vod/clips', payload).then(r => r.data);

/** Browser / phone go-live: WHIP SDP offer → MediaMTX answer (session owner only). */
export const publishLiveWhip = (sessionId, sdp) =>
  client.post(`/live-session/${sessionId}/whip`, { sdp }, { timeout: 20000 }).then((r) => r.data);
export const stopLiveWhip = (sessionId) =>
  client.delete(`/live-session/${sessionId}/whip`).then((r) => r.data);

// Raids — send viewers to another live channel
export const getRaidTargets = () => client.get('/live-session/raid/targets').then(r => r.data);
export const startLiveRaid = (sessionId, target_session_id) =>
  client.post(`/live-session/${sessionId}/raid`, { target_session_id }).then(r => r.data);

// Streamer profile
export const getMyStreamerProfile = () => client.get('/live-streamer/me').then(r => r.data);
export const getLiveCategories = () => client.get('/live-streamer/categories').then(r => r.data);
export const setupStreamerProfile = (data) => client.post('/live-streamer/setup', data).then(r => r.data);
// Reversible channel deactivation — is_active=false hides the channel + blocks going live.
export const setStreamerActive = (is_active) => client.patch('/live-streamer/active', { is_active }).then(r => r.data);

// Live session
export const initLiveSession = (data) => client.post('/live-session/init', data).then(r => r.data);
export const getActiveLiveSession = () => client.get('/live-session/active').then(r => r.data);
export const setLiveSessionStatus = (sessionId, status) => client.patch(`/live-session/${sessionId}/status`, { status }).then(r => r.data);
export const endLiveSession = (sessionId) => client.post(`/live-session/${sessionId}/end`).then(r => r.data);
export const resetLiveStreamKey = (sessionId) => client.delete(`/live-session/${sessionId}/reset-key`).then(r => r.data);
export const getLiveStreamToken = () => client.get('/live-session/token').then(r => r.data);

// Stream Manager (broadcaster dashboard)
export const getStreamManagerState = () => client.get('/live-dashboard/manager').then(r => r.data);
export const getLiveSessionStats = (sessionId) => client.get(`/live-dashboard/${sessionId}/stats`).then(r => r.data);
export const updateLiveSessionMetadata = (sessionId, data) => client.patch(`/live-dashboard/${sessionId}/metadata`, data).then(r => r.data);
export const updateLiveChatSettings = (data) => client.patch('/live-chat/settings', data).then(r => r.data);

// ── Live channel subscriptions (Twitch-style paid subs, Stripe recurring) ──
// Public monthly price/currency for rendering the subscribe button.
export const getSubscriptionPricing = () => client.get('/live-subscription/pricing').then(r => r.data);
// The caller's subscription state for a streamer (drives subscribe/manage UI + badge).
export const getSubscriptionStatus = (streamerId) => client.get(`/live-subscription/status/${streamerId}`).then(r => r.data);
// Start a hosted Stripe Checkout session; returns { url } to redirect to.
export const startSubscriptionCheckout = (payload) => client.post('/live-subscription/checkout', payload).then(r => r.data);
// Cancel at period end (keeps access until the paid period lapses).
export const cancelSubscription = (streamerId) => client.post('/live-subscription/cancel', { streamer_id: streamerId }).then(r => r.data);
// The calling streamer's own active subscriber list + count.
export const getMySubscribers = () => client.get('/live-subscription/subscribers').then(r => r.data);

// ── Live coins + gifts (viewer buys coins, gifts streamer; 80/20 on gift) ───
export const getCoinCatalog = () => client.get('/live-coins/catalog').then(r => r.data);
export const getCoinBalance = () => client.get('/live-coins/balance').then(r => r.data);
export const buyCoins = (pack_id) => client.post('/live-coins/buy', { pack_id }).then(r => r.data);
export const confirmCoinPurchase = (payment_intent_id) => client.post('/live-coins/buy/confirm', { payment_intent_id }).then(r => r.data);
export const sendLiveGift = (payload) => client.post('/live-coins/gift', payload).then(r => r.data);
export const getRecentLiveGifts = (params) => client.get('/live-coins/gifts/recent', { params }).then(r => r.data);
export const getGiftLeaderboard = (streamerId, sessionId) =>
  client.get('/live-coins/gifts/leaderboard', {
    params: {
      ...(streamerId != null ? { streamer_id: streamerId } : {}),
      ...(sessionId != null ? { session_id: sessionId } : {}),
    },
  }).then((r) => r.data);

// ── Streamer earnings wallet + payouts ──────────────────────────────────────
// The calling streamer's wallet balance + monetization status.
export const getLiveWalletBalance = () => client.get('/live-wallet/balance').then(r => r.data);
// Queue a payout (decrements the wallet, creates a PENDING request). amount >= 100.
export const requestLivePayout = (amount) => client.post('/live-wallet/payout-request', { amount }).then(r => r.data);
// The caller's own payout-request history.
export const getLivePayoutHistory = () => client.get('/live-wallet/transactions').then(r => r.data);

// Stripe Connect (Express) — optional automated payouts.
// Whether the caller's connected account can receive transfers yet.
export const getConnectStatus = () => client.get('/live-wallet/connect/status').then(r => r.data);
// Start (or refresh) Connect onboarding; returns { url } to redirect to.
export const startConnectOnboarding = () => client.post('/live-wallet/connect/onboard').then(r => r.data);

// ── Admin: payout queue ─────────────────────────────────────────────────────
export const adminGetPayouts = (status) => client.get('/live-wallet/admin/payouts', { params: status ? { status } : {} }).then(r => r.data);
export const adminApprovePayout = (payoutId, note) => client.post(`/live-wallet/admin/payouts/${payoutId}/approve`, { note }).then(r => r.data);
export const adminMarkPayoutPaid = (payoutId, reference) => client.post(`/live-wallet/admin/payouts/${payoutId}/mark-paid`, { reference }).then(r => r.data);
export const adminRejectPayout = (payoutId, note) => client.post(`/live-wallet/admin/payouts/${payoutId}/reject`, { note }).then(r => r.data);

// ── Admin: monetization request queue ───────────────────────────────────────
export const adminGetMonetizationRequests = (status) => client.get('/live-monetization/admin/requests', { params: status ? { status } : {} }).then(r => r.data);
export const adminResolveMonetization = (requestId, action, note) => client.patch(`/live-monetization/admin/resolve/${requestId}`, { action, note }).then(r => r.data);

// ── Chat moderation (streamer dashboard, #258) ──────────────────────────────
// All scoped to the caller's own channel; back the "Moderation" dashboard tab.
export const getChatSettings = () => client.get('/live-chat/settings').then(r => r.data);
export const updateChatSettings = (settings) => client.patch('/live-chat/settings', settings).then(r => r.data);
export const getChatModerators = () => client.get('/live-chat/moderators').then(r => r.data);
export const addChatModerator = (target_username) => client.post('/live-chat/moderator/add', { target_username }).then(r => r.data);
export const removeChatModerator = (userId) => client.delete(`/live-chat/moderator/${userId}`).then(r => r.data);
export const getChatBans = () => client.get('/live-chat/bans').then(r => r.data);
export const banChatUser = ({ target_username, target_user_id, reason, duration_minutes, streamer_id }) =>
  client.post('/live-chat/ban', { target_username, target_user_id, reason, duration_minutes, streamer_id }).then(r => r.data);
export const unbanChatUser = (userId) => client.delete(`/live-chat/ban/${userId}`).then(r => r.data);
export const timeoutChatUser = ({ target_user_id, streamer_id, duration_minutes = 10, reason }) =>
  client.post('/live-chat/timeout', { target_user_id, streamer_id, duration_minutes, reason }).then(r => r.data);
export const deleteLiveChatMessage = (messageId) =>
  client.delete(`/live-chat/message/${messageId}`).then(r => r.data);
export const getBannedWords = () => client.get('/live-chat/words').then(r => r.data);
export const addBannedWord = (word) => client.post('/live-chat/words', { word }).then(r => r.data);
export const removeBannedWord = (wordId) => client.delete(`/live-chat/words/${wordId}`).then(r => r.data);
