import client from './client';

export const getVideoFeed = (params) => client.get('/video/feed', { params }).then(r => r.data);
export const getVideo = (id) => client.get(`/video/play/${id}`).then((r) => {
	const raw = r.data?.data ?? r.data;
	if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
	return raw;
});
export const getShorts = (params) => client.get('/video/shorts', { params }).then(r => r.data);
export const getHomeFeed = (params) => client.get('/video/home-feed', { params }).then(r => r.data);
export const searchVideos = (q) => client.get('/video/search', { params: { q } }).then(r => r.data);
export const suggestVideos = (q) => client.get('/video/suggest', { params: { q } }).then(r => r.data);
export const getVideoRecommendations = (videoId, params = {}) => client.get(`/video/recommendations/${videoId}`, { params }).then(r => r.data);

export const getCreatorContent = (page = 1) => client.get('/creator-studio/content', { params: { page } }).then(r => r.data);
export const startYoutubeImport = (url) => client.post('/creator-studio/youtube-import', { url }).then(r => r.data);
export const getYoutubeImport = () => client.get('/creator-studio/youtube-import').then(r => r.data);
export const cancelYoutubeImport = () => client.post('/creator-studio/youtube-import/cancel').then(r => r.data);
// Edit a video's title/description (owner-scoped) — Creator Studio "Content" tab.
export const updateCreatorVideo = (videoId, data) => client.put(`/creator-studio/video/${videoId}`, data).then(r => r.data);
// v2 metadata patch — PATCH /video/:id/metadata (title, description, category).
export const updateVideoMetadata = (videoId, data) => client.patch(`/video/${videoId}/metadata`, data).then(r => r.data);
export const getMyChannel = () => client.get('/channel/me').then(r => r.data);
export const getChannelByHandle = (handle) => client.get(`/channel/profile/${handle}`).then(r => r.data);
export const getChannelAnalytics = () => client.get('/channel/me/analytics').then(r => r.data);
// Analytics Services
export const getCreatorOverview = (range, config = {}) =>
    client.get(`/channel/me/analytics/overview?range=${encodeURIComponent(range)}`, config).then(r => r.data);

export const getCreatorVideoAnalytics = (videoId, range, config = {}) =>
    client.get(`/channel/me/analytics/videos/${encodeURIComponent(videoId)}?range=${encodeURIComponent(range)}`, config).then(r => r.data);

export const createChannel = (data) => client.post('/channel', data).then(r => r.data);
export const updateChannel = (data) => client.put('/channel/update', data).then(r => r.data);
// Reversible channel deactivation — is_active=false hides the channel + its videos from discovery.
export const setChannelActive = (is_active) => client.patch('/channel/active', { is_active }).then(r => r.data);
export const uploadVideo = (fd) => client.post('/video/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
// Owner-scoped thumbnail upload. Goes through the axios client so it gets the 401→refresh
// interceptor (the old raw fetch read the token from localStorage and silently dropped the
// thumbnail on a stale token) — see audit F2.
export const uploadVideoThumbnail = (videoId, fd) => client.post(`/video/${videoId}/thumbnail`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
// The batch presign endpoint (/video/bulk/presign) is the one that CREATES the video row and
// returns a video_id (the single /video/presign only mints a SAS token and returns no id/array,
// so posting the batch shape { channel_id, videos:[...] } to it 400'd — uploads were broken on
// prod, #342/#343). It expects { channel_id, videos: [ { filename, file_size_bytes, title,
// description, category, video_type } ] } and returns { data: [ { video_id, sas_url, blob_url,
// blob_name } ] }. Callers presign one file at a time, so wrap the single meta and unwrap data[0].
export const presignVideoUpload = (meta) => {
  const { channel_id, ...video } = meta;
  return client.post('/video/bulk/presign', { channel_id, videos: [video] })
    .then(r => r.data?.data?.[0] ?? r.data);
};
// Bulk presign: request SAS URLs for up to 5 videos at once.
// Expects { channel_id, videos: [{ title, description, filename, video_type, category, ... }] }
// Returns { successful, data: [ { video_id, sas_url, blob_url, blob_name } ] }
export const bulkPresignVideos = (data) => client.post('/video/bulk/presign', data).then(r => r.data);
// Bulk direct upload: send up to 5 videos + thumbnails as multipart form fields at once.
export const bulkUploadVideos = (fd) => client.post('/video/bulk/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
// Finalize attaches the uploaded blob as the raw video and kicks off transcoding. The backend
// finalizeSchema requires raw_video_url + title (it re-verifies the blob exists and re-stamps
// metadata on the pending row), so we must send those — sending only { blob_url } 400'd and left
// the row stuck at processing_status='pending' forever ("still processing", #340/#336). The row
// already carries title/description/category/type from presign; we resend them for the schema.
export const finalizeVideoUpload = (videoId, rawVideoUrl, meta = {}) =>
  client.patch(`/video/${videoId}/finalize`, {
    raw_video_url: rawVideoUrl,
    title: meta.title,
    description: meta.description ?? null,
    category: meta.category || 'General',
    video_type: meta.video_type || 'long',
  }).then(r => r.data);

export const getVideoComments = (videoId) => client.get(`/video/${videoId}/comments`).then(r => r.data);
export const addVideoComment = (videoId, content, parent_id = null) => client.post(`/video/${videoId}/comments`, { content, parent_id }).then(r => r.data);
// The route is DELETE /video/comments/:comment_id — it takes the comment id ALONE and resolves
// the video (and the author/creator/admin permission check) server-side. Threading a videoId into
// the path built /video/:id/comments/:id, which matches no route: every delete 404'd, the catch
// restored the row, and "delete my comment" silently did nothing.
export const deleteVideoComment = (commentId) => client.delete(`/video/comments/${commentId}`).then(r => r.data);
export const toggleCommentLike = (videoId, commentId) => client.post(`/video-social/${videoId}/comments/${commentId}/like`).then(r => r.data);
export const toggleVideoLike = (videoId) => client.post(`/video/${videoId}/like`).then(r => r.data);
export const toggleVideoDislike = (videoId) => client.post(`/video/${videoId}/dislike`).then(r => r.data);
export const getLikedVideoIds = () => client.get('/video-social/liked').then(r => r.data?.video_ids ?? []);
// Socialisation-layer variants — used when a video surfaces inside the social/town-hall feed
// rather than the main video watch page. Separate namespace from /video/:id/*.
export const toggleVideoSocialLike = (videoId) => client.post(`/video-social/${videoId}/like`).then(r => r.data);
export const addVideoSocialComment = (videoId, content) => client.post(`/video-social/${videoId}/comment`, { content }).then(r => r.data);
export const getVideoSocialComments = (videoId) => client.get(`/video-social/${videoId}/comments`).then(r => r.data);

export const subscribeToChannel = (channelId) => client.post(`/channel/${channelId}/subscribe`).then(r => r.data);
export const unsubscribeFromChannel = (channelId) => client.delete(`/channel/${channelId}/subscribe`).then(r => r.data);
export const getChannelSubscriptionStatus = (channelId) => client.get(`/channel/${channelId}/subscription-status`).then(r => r.data);

export const recordVideoView = (videoId) => client.post(`/video-engagement/${videoId}/view`).then(r => r.data);
// Report the viewer's current playback position so the backend can credit forward watch-time
// (powers Creator Studio "Watch Time" + per-video retention). Best-effort; fire-and-forget.
// Backend /ping expects { last_position } (number) — sending the wrong key 400s and silently
// drops the credit, which also leaves /resume with nothing to return.
export const recordWatchProgress = (videoId, currentTimeSec) => client.post(`/video-engagement/${videoId}/ping`, { last_position: Math.floor(currentTimeSec) }).then(r => r.data);
// Fetch server-side resume position so watch history persists across devices/browsers.
export const getWatchResume = (videoId) => client.get(`/video-engagement/${videoId}/resume`).then(r => r.data);
// Record that an ad was fully viewed — triggers the single-use ad payout ledger entry.
export const recordAdViewComplete = (videoId, adToken) => client.post(`/video-engagement/${videoId}/ad-view-complete`, { ad_token: adToken }).then(r => r.data);
export const getWatchHistory = (params = {}) => client.get('/video-engagement/history', { params }).then(r => r.data);

// #492 — "Friends are watching" discovery rail. Friends = mutual follows; each friend's
// activity is only included if THEY opted into sharing (backend-enforced). `exclude` drops the
// currently-playing video. Returns [] when opted out, no friends, or no shared activity.
export const getFriendVideoActivity = (excludeVideoId) =>
  client.get('/video-friend-activity/feed', { params: excludeVideoId ? { exclude: excludeVideoId } : {} })
    .then(r => r.data?.data ?? []);
export const getFriendVideoActivityPage = (params = {}) =>
  client.get('/video-friend-activity/feed', { params }).then(r => r.data);
/** Mutual friends subscribed to a channel — watch drawer Circle + Choice overlap banner. */
export const getFriendChannelOverlap = (channelId) => {
  const id = Number(channelId);
  if (!Number.isFinite(id) || id <= 0) return Promise.resolve([]);
  return client.get('/video-friend-activity/channel-overlap', { params: { channel_id: id } })
    .then(r => r.data?.data ?? [])
    .catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[videos] channel-overlap failed', err?.response?.status || err?.message || err);
      }
      return [];
    });
};
export const getFriendActivityPrefs = () => client.get('/video-friend-activity/preferences').then(r => r.data);
export const updateFriendActivityPrefs = (patch) => client.patch('/video-friend-activity/preferences', patch).then(r => r.data);

// Personalised chip-row signals: the viewer's own category affinity plus what is popular in their
// country and globally. Deliberately NOT a finished chip order — the ordering policy (pinned
// "All", diversity caps, stability) lives in utils/videoChipRanking.js so one implementation
// serves both the signed-in and signed-out cases. Returns null when the endpoint is unavailable
// (older backend, signed out, network) so callers fall back to the built-in defaults.
export const getChipSignals = () =>
  client.get('/video-discovery/chip-signals').then(r => r.data?.data ?? null).catch(() => null);
// Fire-and-forget search logging. `result_count` is the valuable part: a query that found nothing
// is demand for content that does not exist yet, which watch history can never reveal.
export const logVideoSearch = (query, resultCount) =>
  client.post('/video-discovery/search-log', { query, result_count: resultCount }).catch(() => {});

// Playlists (server-backed)
const unwrapData = (r) => r?.data?.data ?? r?.data ?? r;
const numericVideoId = (videoId) => {
  const n = Number(videoId);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const getPlaylists = () => client.get('/playlist').then(unwrapData);
export const getChannelPlaylists = (channelId) => client.get(`/playlist/channel/${Number(channelId)}`).then(unwrapData);
export const createPlaylist = (name, videoId, { isPublic } = {}) => {
  const video_id = numericVideoId(videoId);
  return client.post('/playlist', {
    name,
    ...(video_id ? { video_id } : {}),
    ...(isPublic ? { is_public: true } : {}),
  }).then(unwrapData);
};
export const updatePlaylistVisibility = (playlistId, isPublic) =>
  client.patch(`/playlist/${Number(playlistId)}`, { is_public: !!isPublic }).then(unwrapData);
export const addVideoToPlaylist = (playlistId, videoId) =>
  client.post(`/playlist/${playlistId}/items`, { video_id: numericVideoId(videoId) ?? videoId }).then(unwrapData);
export const removeVideoFromPlaylist = (playlistId, videoId) => client.delete(`/playlist/${playlistId}/items/${videoId}`).then(unwrapData);
export const deletePlaylist = (playlistId) => client.delete(`/playlist/${playlistId}`).then(unwrapData);

export const getWatchLater = () => client.get('/video/watch-later').then(r => r.data);
export const toggleWatchLater = (videoId) => client.post(`/video/${videoId}/watch-later`).then(r => r.data);
export const deleteVideo = (videoId) => client.delete(`/video/${videoId}`).then(r => r.data);
export const uploadChannelBranding = (file, type) => { const fd = new FormData(); fd.append('image', file); fd.append('type', type); return client.post('/channel/branding/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data); };

export const getMySubscriptions = () => client.get('/channel/subscriptions').then(r => r.data);
/** Latest upload per subscribed channel — watch-edge Subs drawer. */
export const getSubscriptionUploads = (params = {}) =>
  client.get('/channel/subscriptions/uploads', { params }).then(r => r.data);
export const getSubscriptionCreatorPicks = (params = {}) =>
  client.get('/channel/subscriptions/creator-picks', { params }).then(r => r.data);
export const createCreatorPick = (body) =>
  client.post('/channel/me/creator-picks', body).then(r => r.data);
// Monetization milestone tracker — returns { successful, data: { current_subs, required_subs,
// current_watch_hours, required_watch_hours, is_eligible, is_verified, progress_percentage } }.
export const getMonetizationStatus = () => client.get('/channel/monetization-status').then(r => r.data);
// Submit a channel verification request (shown as a badge application).
export const requestChannelVerification = () => client.post('/channel/request-verification').then(r => r.data);
