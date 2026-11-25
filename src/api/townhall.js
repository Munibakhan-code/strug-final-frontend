import client from './client';

export const getTownHallFeed = (page = 1, limit = 20) =>
    client.get('/town-hall', { params: { page, limit } }).then(r => r.data);

// Feed limited to authors the viewer follows.
export const getTownHallFollowing = (page = 1, limit = 20) =>
    client.get('/town-hall/following', { params: { page, limit } }).then(r => r.data);

// Free-text search over post content (#338). Returns { successful, posts: [...] }
// where each post is the same hydrated/viewer-state shape as the feed.
export const searchTownHallPosts = (q) =>
    client.get('/town-hall/search-posts', { params: { q } }).then(r => r.data);

export const createTownHallPost = (content, parent_id = null, scheduled_at = null) =>
    client.post('/town-hall', { content, parent_id, scheduled_at }).then(r => r.data);

// A single post — lets an open post detail survive a refresh / deep link (#13).
export const getTownHallPost = (id) =>
    client.get(`/town-hall/${id}`).then(r => r.data);

// Public fetch for cold-load / OG prerender — no auth required.
export const getTownHallPostPublic = (id) =>
    client.get(`/town-hall/public/${id}`).then(r => r.data);

// Increment a post's real view counter (best-effort; fire-and-forget on the client).
export const viewTownHallPost = (id) =>
    client.post(`/town-hall/${id}/view`).then(r => r.data);

export const deleteTownHallPost = (id) =>
    client.delete(`/town-hall/${id}`).then(r => r.data);

export const toggleTownHallLike = (id) =>
    client.post(`/town-hall/${id}/like`).then(r => r.data);

export const getTownHallReplies = (id) =>
    client.get(`/town-hall/${id}/replies`).then(r => r.data);

// A single user's Town Hall posts — merged into their profile's Posts/Images tabs (#6/#7).
// Paginated (#42): without paging a profile only ever showed the first 50 posts.
export const getUserTownHallPosts = (userId, page = 1, limit = 100) =>
    client.get(`/town-hall/user/${userId}`, { params: { page, limit } }).then(r => r.data);

export const toggleTownHallRepost = (id) =>
    client.post(`/town-hall/${id}/repost`).then(r => r.data);

export const getTownHallQuotes = (id) =>
    client.get(`/town-hall/${id}/quotes`).then(r => r.data);

export const toggleSavePost = (post_id) => 
    client.post(`/town-hall/save`, { post_id }).then(r => r.data);

export const getSavedPosts = () => 
    client.get('/town-hall/saved').then(r => r.data);

export const createTownHallPostWithMedia = (content, parent_id = null, media_url = null, media_type = null, quote_post_id = null, scheduled_at = null, poll_options = null, product_id = null) =>
    client.post('/town-hall', {
        content, parent_id, media_url, media_type, quote_post_id, scheduled_at,
        ...(poll_options?.length ? { poll_options } : {}),
        ...(product_id != null ? { product_id } : {}),
    }).then(r => r.data);

// Rich create path — payload may include: content, parent_id, media_url, media_type,
// quote_post_id, scheduled_at, product_id, poll_options.
export const createTownHallPostFull = (payload) =>
    client.post('/town-hall', payload).then(r => r.data);

export const voteTownHallPoll = (postId, optionId) =>
    client.post(`/town-hall/${postId}/poll/vote`, { option_id: optionId }).then(r => r.data);

export const getTownHallVoicesToFollow = (limit = 8) =>
    client.get('/town-hall/voices-to-follow', { params: { limit } }).then(r => r.data);

export const getTownHallTrendingTopics = (limit = 10) =>
    client.get('/town-hall/trending-topics', { params: { limit } }).then(r => r.data);

export const uploadTownHallMedia = (file) => {
    const fd = new FormData();
    fd.append('media', file);
    return client.post('/town-hall/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90000 }).then(r => r.data);
};

export const getTownHallTrending = (page = 1, limit = 20) =>
    client.get('/town-hall/trending', { params: { page, limit } }).then(r => r.data);

// #470 "Post of the Week": the single highest-engagement post of the last 7 days (un-decayed total
// engagement, so it complements — not duplicates — the time-decayed Trending tab). Returns null when
// no post has engagement.
export const getTownHallSpotlight = () =>
    client.get('/town-hall/spotlight').then(r => r.data);

/** Paste X/Twitter profile → background copy into Town Hall (mirrors Creator Studio YouTube import). */
export const startTownhallImport = (url) =>
    client.post('/town-hall/import', { url }).then(r => r.data);

export const getTownhallImport = () =>
    client.get('/town-hall/import').then(r => r.data);