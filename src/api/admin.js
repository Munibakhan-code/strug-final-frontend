import client from './client';

export const getAdminUsers = (page = 1, limit = 15, search = '', verified = '', banned = '') =>
    client.get('/admin/users', { params: { page, limit, search, verified, banned } }).then(r => r.data);

export const getAdminUser = (userId) =>
    client.get(`/admin/users/${userId}`).then(r => r.data);

export const verifyUser = (userId, is_verified, verification_type) =>
    client.patch(`/admin/users/${userId}/verify`, { is_verified, verification_type }).then(r => r.data);

export const banUser = (userId, is_banned) =>
    client.patch(`/admin/users/${userId}/ban`, { is_banned }).then(r => r.data);

export const shadowBanUser = (userId, is_shadow_banned) =>
    client.patch(`/admin/users/${userId}/shadow-ban`, { is_shadow_banned }).then(r => r.data);

export const updateUserRole = (userId, role) =>
    client.patch(`/admin/users/${userId}/role`, { role }).then(r => r.data);

// Content-moderation review queue (W8): videos the transcode worker flagged
// (sensitive | auto_banned | scan_unavailable) for a human to approve or ban.
export const adminGetFlaggedVideos = (flag = '') =>
    client.get('/video/admin/flagged', { params: flag ? { flag } : {} }).then(r => r.data);

export const adminResolveFlaggedVideo = (videoId, action) =>
    client.post(`/video/admin/${videoId}/moderation`, { action }).then(r => r.data);

export { adminGetJobReports, adminResolveJobReport } from './jobs';
