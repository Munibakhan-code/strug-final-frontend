import client from './client';

// Feed
export const getFeed = (params) => client.get('/social-feed/home', { params }).then(r => r.data);
export const getExploreFeed = (params) => client.get('/social-feed/explore', { params }).then(r => r.data);

// Compliance — record the user's Terms & Privacy acceptance (backend: PATCH /social-compliance/accept-terms)
export const acceptTerms = () => client.patch('/social-compliance/accept-terms').then(r => r.data);

// Posts (social-post routes)
export const getPost = (id) => client.get(`/social-post/${id}`).then(r => r.data);
export const getUserPosts = (userId) => client.get(`/social-post/`, { params: { user_id: userId } }).then(r => r.data);
// export const createPost = (data) => client.post('/social-post/create', data).then(r => r.data);
export const createPost = async (data) => {
  return client.post('/social-post/create', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,
    onUploadProgress: (e) => {
      const percent = Math.round((e.loaded * 100) / e.total);
      window.dispatchEvent(new CustomEvent("upload:progress", { detail: percent }));
    }
  }).then(r => r.data);
};

// Comments — backend route is /:post_id for both GET and POST
export const getPostComments = (postId) => client.get(`/social-comments/${postId}`).then(r => r.data);
export const addComment = (postId, data) => client.post(`/social-comments/${postId}`, data).then(r => r.data);
export const deleteComment = (id) => client.delete(`/social-comments/${id}`).then(r => r.data);

// Interactions (likes etc.)
export const getPostInteractions = (postId) => client.get(`/social-interactions/post/${postId}`).then(r => r.data);
export const addInteraction = (data) => client.post('/social-interactions/', data).then(r => r.data);
export const removeInteraction = (id) => client.delete(`/social-interactions/${id}`).then(r => r.data);

// Follow (toggle + lists)
export const toggleFollow = (targetProfileId) => client.post(`/social-follow/toggle/${targetProfileId}`).then(r => r.data);
export const toggleFollowByUserId = (targetUserId) => client.post(`/social-follow/toggle-by-user/${targetUserId}`).then(r => r.data);
export const getFollowers = (profileId) => client.get(`/social-follow/followers/${profileId}`).then(r => r.data);
export const getFollowing = (profileId) => client.get(`/social-follow/following/${profileId}`).then(r => r.data);
export const getFollowCounts = (profileId) => client.get(`/social-follow/counts/${profileId}`).then(r => r.data);
// Authoritative "do I follow this profile?" check (not a capped list scan).
export const isFollowingUser = (profileId) => client.get(`/social-follow/is-following/${profileId}`).then(r => r.data);
export const isFollowingByUserId = (targetUserId) =>
  client.get(`/social-follow/is-following-by-user/${targetUserId}`).then(r => r.data);
// "Who to follow" discovery — public profiles you don't already follow, ranked by popularity.
export const getFollowSuggestions = (limit = 12) => client.get(`/social-follow/suggestions`, { params: { limit } }).then(r => r.data);

/** Inbound pending follow requests (private profile owner). #1626 */
export const getFollowRequests = (limit = 50) =>
  client.get('/social-follow/requests', { params: { limit } }).then(r => r.data);
export const acceptFollowRequest = (requesterProfileId) =>
  client.post(`/social-follow/requests/${requesterProfileId}/accept`).then(r => r.data);
export const rejectFollowRequest = (requesterProfileId) =>
  client.post(`/social-follow/requests/${requesterProfileId}/reject`).then(r => r.data);

// Moderation — backend validates target_type against
// ['POST','COMMENT','PROFILE','VIDEO','TOWN_HALL_POST'].
//
// The reason string is what moderators actually triage on, and the board dashboard tallies
// it verbatim ("Report Reasons"). Reports used to ship a hardcoded sentence, which made that
// view useless and told a moderator nothing. Send one of REPORT_REASONS so the tally groups.
export const REPORT_REASONS = [
  'Spam or misleading',
  'Adult or sexual content',
  'Harassment or hate',
  'Violence or dangerous content',
  'Scam or fraud',
  'Copyright violation',
  'Other',
];

// Report a specific piece of content. Prefer this over reportProfile: reporting the author
// for something one of their posts did loses the very thing the moderator needs to look at.
export const reportContent = (targetType, targetId, reason, detail = '') =>
  client.post('/social-moderation/report', {
    target_type: targetType,
    target_id: targetId,
    // "Other" alone is unactionable, so the free-text detail is appended when present.
    reason: detail ? `${reason} — ${detail}`.slice(0, 1000) : reason,
  }).then(r => r.data);

// Pass the TARGET profile's id (not the viewer's). Use for reporting an account itself.
export const reportProfile = (targetProfileId, reason = 'Reported by user') =>
  client.post('/social-moderation/report', { target_type: 'PROFILE', target_id: targetProfileId, reason }).then(r => r.data);

// Privacy — block/mute a profile (toggle). Both take a target profile_id.
export const blockUser = (targetProfileId) => client.post(`/social-privacy/block/${targetProfileId}`).then(r => r.data);
export const getBlockedUsers = () => client.get('/social-privacy/blocked').then(r => r.data);
export const unblockUser = (targetProfileId) => client.delete(`/social-privacy/block/${targetProfileId}`).then(r => r.data);
export const muteUser = (targetProfileId) => client.post(`/social-privacy/mute/${targetProfileId}`).then(r => r.data);
/** Close friends list (Instagram-style audience, separate from followers). */
export const getCloseFriends = () => client.get('/social-privacy/close-friends').then(r => r.data);
export const toggleCloseFriend = (targetProfileId) =>
  client.post(`/social-privacy/close-friends/${targetProfileId}`).then(r => r.data);
/** Set profile private/public. Backend accepts explicit is_private, or toggles if omitted. */
export const setProfilePrivate = (is_private) =>
  client.patch('/social-privacy/settings/privacy', { is_private: !!is_private }).then(r => r.data);

// Notifications
export const getNotifications = () => client.get('/social-notification').then(r => r.data);
export const markNotificationRead = (id) => client.patch(`/social-notification/read/${id}`).then(r => r.data);
export const markAllNotificationsRead = () => client.patch('/social-notification/read-all').then(r => r.data);

// Stories
export const getStoryFeed = () => client.get('/social-story/feed').then(r => r.data);
export const createStory = (formData) => 
  client.post('/social-story/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  }).then(r => r.data);
export const viewStory = (id) => client.post(`/social-story/${id}/view`).then(r => r.data);

// Story Highlights (#467) — permanent, curated collections of stories on the profile.
// Cover uploads go up as multipart FormData; Content-Type is left unset so axios/the browser
// attaches the correct boundary (mirrors updateProfilePhoto / updateProfileBanner).
export const getProfileHighlights = (profileId) => client.get(`/social-story/highlight/profile/${profileId}`).then(r => r.data);
export const getHighlight = (id) => client.get(`/social-story/highlight/${id}`).then(r => r.data);
export const getStoryArchive = () => client.get('/social-story/archive').then(r => r.data);
export const createHighlight = (formData) => client.post('/social-story/highlight/create', formData).then(r => r.data);
export const updateHighlight = (id, formData) => client.patch(`/social-story/highlight/${id}`, formData).then(r => r.data);
export const deleteHighlight = (id) => client.delete(`/social-story/highlight/${id}`).then(r => r.data);
export const reorderHighlights = (order) => client.patch('/social-story/highlight/reorder', { order }).then(r => r.data);
export const addStoriesToHighlight = (id, storyIds) => client.post(`/social-story/highlight/${id}/stories`, { story_ids: storyIds }).then(r => r.data);
export const removeStoryFromHighlight = (id, storyId) => client.delete(`/social-story/highlight/${id}/stories/${storyId}`).then(r => r.data);

// Profile photo
export const updateProfilePhoto = async (file) => {
  const fd = new FormData();
  fd.append('photo', file);
  return client.patch('/social-profile/photo', fd).then(r => r.data);
};

// Update social profile fields (bio, display_name)
export const updateSocialProfile = (data) => client.patch('/social-profile/me', data).then(r => r.data);
export const getMyProfile = () => client.get('/social-profile/me').then(r => r.data);

// #481/#11: clear the one-time "please re-upload your photo" notice after the user sees it.
export const dismissAvatarNotice = () => client.post('/social-profile/me/dismiss-avatar-notice').then(r => r.data);
export const updateProfileBanner = (file) => {
  const fd = new FormData();
  fd.append('banner', file);
  return client.patch('/social-profile/banner', fd).then(r => r.data);
};
export const getProfileByUserId = (userId) => client.get(`/social-profile/by-user/${userId}`).then(r => r.data);
export const getProfileByHandle = (handle) => client.get(`/social-profile/by-handle/${encodeURIComponent(handle)}`).then(r => r.data);
export const getVideoFeed = () => client.get('/social-feed/video-feed').then(r => r.data);

// Community posts
export const getCommunityPosts = (communityId) => client.get('/community-post/', { params: { community: communityId } }).then(r => r.data);

// Discovery
export const searchContent = (q) => client.get('/social-discovery/search', { params: { q } }).then(r => r.data);
export const getTrendingTags = () => client.get('/social-discovery/trending-tags').then(r => r.data);
export const getPostsByTag = (tagName) => client.get(`/social-discovery/tag/${encodeURIComponent(tagName)}`).then(r => r.data);

// Handle change
export const updateHandle = (handle) => client.patch('/social-profile/me/handle', { handle }).then(r => r.data);

// Share post
export const sharePost = (postId) => client.post(`/social-interaction/share/${postId}`).then(r => r.data);

// toggle save post
// export const toggleBookmarkAPI = (postId) => client.post(`/social-post/${postId}/bookmark`).then(r => r.data);
// // toggle like api
// export const toggleLikeAPI = (postId) => client.post(`/social-post/like/${postId}`).then(r => r.data);

// ⚡ Like Toggle Endpoint
export const toggleLikeAPI = (postId) => client.post(`/social-interactions/like/${postId}`).then(r => r.data);
export const getLikedPosts = () => client.get('/social-interactions/liked-posts').then(r => r.data);
export const getBookmarkedPosts = () => client.get('/social-interactions/bookmarks/me').then(r => r.data);

// ⚡ Bookmark Toggle Endpoint
export const toggleBookmarkAPI = (postId) => client.post(`/social-interactions/bookmark/${postId}`).then(r => r.data);

// ⚡ Get Comments Endpoint
export const getCommentsAPI = (postId) => client.get(`/social-comment/${postId}`).then(r => r.data);
// ⚡ Add Comment Endpoint
export const addCommentAPI = (postId, data) => client.post(`/social-comment/${postId}`, data).then(r => r.data);

// ⚡ Delete Comment Endpoint
export const deleteCommentAPI = (commentId) => client.delete(`/social-comment/${commentId}`).then(r => r.data);

// ⚡ Update Comment Endpoint
export const updateCommentAPI = (commentId, data) => client.put(`/social-comment/${commentId}`, data).then(r => r.data);


// Recommendations — personalized "For You" feed + engagement signal capture
export const getForYou = (params) => client.get('/social-recommendations/for-you', { params }).then(r => r.data);
export const trackImpressions = (items) => client.post('/social-recommendations/impression', { items }).then(r => r.data);
export const getInterests = () => client.get('/social-recommendations/interests').then(r => r.data);

// Delete Post
export const deletePost = (id) => client.delete(`/social-post/${id}`).then(r => r.data);

// Update Post
export const updatePost = (postId, data) => client.put(`/social-post/${postId}`, data).then(r => r.data);
// #422: the post the owner chose to pin to their profile. post_id: null unpins.
export const setPinnedPost = (postId, postType = 'social') =>
  client.patch('/social-profile/me/pinned', { post_id: postId, post_type: postType }).then(r => r.data);

// #422: the single most-viewed thing this user has published — a video, a town hall post or a
// social post, whichever has the most views. Returns { type, id, views, text, image } or null.
export const getMostViewedForUser = (userId) =>
  client.get(`/social-profile/${userId}/most-viewed`).then(r => r.data?.data ?? null);
