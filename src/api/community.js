import client from './client';

export const getCommunities     = (params) => client.get('/community', { params }).then(r => r.data);
export const getCommunity       = (id)     => client.get(`/community/${id}`).then(r => r.data);
export const createCommunity    = (data)   => client.post('/community', data).then(r => r.data);
export const updateCommunity    = (id, data) => client.put(`/community/${id}`, data).then(r => r.data);
export const deleteCommunity    = (id)     => client.delete(`/community/${id}`).then(r => r.data);
export const joinCommunity      = (id)     => client.post(`/community/${id}/join`).then(r => r.data);
export const leaveCommunity     = (id)     => client.post(`/community/${id}/leave`).then(r => r.data);
export const checkMembership    = (id)     => client.get(`/community/${id}/is-member`).then(r => r.data);

// Identity + customization (#261 / #262)
export const getCommunityByHandle = (handle) => client.get(`/community/by-handle/${handle}`).then(r => r.data);
export const customizeCommunity   = (id, data) => client.patch(`/community/${id}/customize`, data).then(r => r.data);

function uploadCommunityImage(id, field, file) {
    const form = new FormData();
    form.append(field, file);
    return client.patch(`/community/${id}/${field}`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
}
export const uploadCommunityBanner = (id, file) => uploadCommunityImage(id, 'banner', file);
export const uploadCommunityIcon   = (id, file) => uploadCommunityImage(id, 'icon', file);

// Rules & flair (#263)
export const getCommunityRules  = (id)         => client.get(`/community/${id}/rules`).then(r => r.data);
export const saveCommunityRules = (id, rules)  => client.put(`/community/${id}/rules`, { rules }).then(r => r.data);
export const getCommunityFlair  = (id)         => client.get(`/community/${id}/flair`).then(r => r.data);
export const saveCommunityFlair = (id, flairs) => client.put(`/community/${id}/flair`, { flairs }).then(r => r.data);

// Moderation team, bans, reports (#264/#268)
export const getModerators    = (id)                => client.get(`/community/${id}/moderators`).then(r => r.data);
export const addModerator     = (id, username, permissions) => client.post(`/community/${id}/moderators`, { username, permissions }).then(r => r.data);
export const updateModerator  = (id, userId, permissions)   => client.patch(`/community/${id}/moderators/${userId}`, { permissions }).then(r => r.data);
export const removeModerator  = (id, userId)        => client.delete(`/community/${id}/moderators/${userId}`).then(r => r.data);
export const getCommunityBans = (id)                => client.get(`/community/${id}/bans`).then(r => r.data);
export const banUser          = (id, data)          => client.post(`/community/${id}/ban`, data).then(r => r.data);
export const unbanUser        = (id, userId)        => client.delete(`/community/${id}/bans/${userId}`).then(r => r.data);
export const reportToCommunity= (id, data)          => client.post(`/community/${id}/report`, data).then(r => r.data);
export const getCommunityReports = (id, status='open') => client.get(`/community/${id}/reports`, { params: { status } }).then(r => r.data);
export const resolveReport    = (id, reportId, status) => client.patch(`/community/${id}/reports/${reportId}`, { status }).then(r => r.data);
export const moderatePost     = (postId, action)    => client.patch(`/community-post/${postId}/moderate`, { action }).then(r => r.data);

// Safety — reuse platform block/mute (#268)
export const blockUser = (targetId) => client.post(`/social-privacy/block/${targetId}`).then(r => r.data);
export const muteUser  = (targetId) => client.post(`/social-privacy/mute/${targetId}`).then(r => r.data);

// Awards & karma (#267)
export const getCommunityAwards = (id)              => client.get(`/community/${id}/awards`).then(r => r.data);
export const givePostAward      = (postId, awardId) => client.post(`/community-post/${postId}/award`, { award_id: awardId }).then(r => r.data);
export const giveCommentAward   = (commentId, awardId) => client.post(`/community-post/comment/${commentId}/award`, { award_id: awardId }).then(r => r.data);
export const getMyKarma         = ()                => client.get('/community/karma/me').then(r => r.data);
export const getUserKarma       = (userId)          => client.get(`/community/karma/${userId}`).then(r => r.data);

// Community admin analytics (#269)
export const getCommunityAnalytics = (id) => client.get(`/community/${id}/analytics`).then(r => r.data);

export const getCommunityFeed       = (scope, sort, offset = 0) => client.get('/community-post/feed', { params: { scope, sort, offset } }).then(r => r.data);
export const getCommunityPosts      = (communityId) => client.get('/community-post', { params: { community_id: communityId } }).then(r => r.data);
export const getCommunityPost       = (id)          => client.get(`/community-post/${id}`).then(r => r.data);
export const createCommunityPost    = (data)        => client.post('/community-post', data).then(r => r.data);
export const voteCommunityPost      = (id, type)    => client.post(`/community-post/${id}/vote`, { vote_type: type }).then(r => r.data);
export const deleteCommunityPost    = (id)          => client.delete(`/community-post/${id}`).then(r => r.data);
export const updateCommunityPost    = (id, d)  => client.put(`/community-post/${id}`, d).then(r => r.data);

export const getCommunityPostComments = (postId) => client.get(`/community-post/${postId}/comments`).then(r => r.data);
export const addCommunityPostComment  = (postId, data) => client.post(`/community-post/${postId}/comments`, data).then(r => r.data);
export const voteComment = (commentId, type) => client.post(`/community-post/comment/${commentId}/vote`, { vote_type: type }).then(r => r.data);

export const deleteComment = (id) => client.delete(`/community-post-comments/${id}`).then(r => r.data);
export const updateComment = (postId, commentId, d) => client.put(`/community-post/${postId}/comments/${commentId}`, d).then(r => r.data);
export const toggleSavePost = (id) => client.post(`/community-post/${id}/save`).then(r => r.data);
export const getSavedPosts = () => client.get('/community-post/saved').then(r => r.data);